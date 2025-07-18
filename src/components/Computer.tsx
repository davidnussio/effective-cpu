import React, { useState, useEffect, useRef, useCallback } from "react";

// --- DEFINIZIONI DELLA CPU ---

// Definisce le istruzioni che la nostra CPU può capire.
const InstructionSet = {
  NOOP: 0,
  LOAD_A_VAL: 1, // Carica un valore immediato nel registro A
  LOAD_B_VAL: 2, // Carica un valore immediato nel registro B
  LOAD_A_MEM: 3, // Carica un valore dalla memoria nel registro A
  LOAD_B_MEM: 4, // Carica un valore dalla memoria nel registro B
  STORE_A: 5, // Salva il valore del registro A in memoria
  STORE_B: 6, // Salva il valore del registro B in memoria
  ADD: 7, // Somma i valori dei registri A e B e salva il risultato in A
  HALT: 8, // Ferma l'esecuzione del programma
  ENABLE_INTERRUPTS: 9, // Abilita gli interrupt
  IRET: 10, // Ritorna da una routine di interrupt
  JMP: 11, // Salta a un indirizzo
  PUSH_A: 12, // Salva registro A sullo stack
  POP_A: 13, // Ripristina registro A dallo stack
  PUSH_B: 14, // Salva registro B sullo stack
  POP_B: 15, // Ripristina registro B dallo stack
};

// Mappa per visualizzare i nomi delle istruzioni
const InstructionNames = Object.fromEntries(
  Object.entries(InstructionSet).map(([key, value]) => [value, key])
);

// Definisce i tipi di interrupt che la CPU può gestire.
const Interrupts = {
  TIMER: 0x01,
};

const InterruptNames = {
  [Interrupts.TIMER]: "TIMER",
};

// --- CLASSE CPU (Logica di simulazione) ---
class CPU {
  memory;
  registers;
  halted = false;
  interruptQueue = [];
  logMessage = "In attesa di avvio...";

  static INTERRUPT_VECTOR_TABLE_START = 0x00;
  static TIMER_ISR_ADDRESS_POINTER =
    CPU.INTERRUPT_VECTOR_TABLE_START + Interrupts.TIMER;

  constructor(memorySize = 256) {
    this.memory = new Uint8Array(memorySize);
    this.registers = {
      A: 0,
      B: 0,
      IR: 0,
      MAR: 0,
      MDR: 0,
      PC: 0,
      SP: memorySize - 1,
      IE: 0,
    };
  }

  loadProgram(program, startAddress = 0) {
    program.forEach((value, index) => {
      if (startAddress + index < this.memory.length) {
        this.memory[startAddress + index] = value;
      }
    });
    this.registers.PC = startAddress;
    this.logMessage = "Programma caricato. Pronto per l'esecuzione.";
  }

  requestInterrupt(interrupt) {
    if (!this.interruptQueue.includes(interrupt)) {
      this.interruptQueue.push(interrupt);
      this.logMessage = `Richiesta di Interrupt ${InterruptNames[interrupt]} ricevuta.`;
    }
  }

  tick() {
    if (this.halted) {
      this.logMessage = "CPU in stato HALT.";
      return;
    }

    if (this.registers.IE === 1 && this.interruptQueue.length > 0) {
      this.handleInterrupt();
      return;
    }

    this.fetch();
    this.decodeAndExecute();
  }

  handleInterrupt() {
    const interruptType = this.interruptQueue.shift();
    if (!interruptType) return;

    this.registers.IE = 0;
    this.pushToStack(this.registers.PC);

    const isrAddressPointer = CPU.TIMER_ISR_ADDRESS_POINTER;
    const isrAddress = this.memory[isrAddressPointer];
    this.registers.PC = isrAddress;

    this.logMessage = `⚡️ Interrupt ${
      InterruptNames[interruptType]
    }! Salto a ISR @0x${isrAddress.toString(16).padStart(2, "0")}.`;
  }

  pushToStack(value) {
    this.memory[this.registers.SP] = value;
    if (this.registers.SP > 0) this.registers.SP--;
  }

  popFromStack() {
    if (this.registers.SP < this.memory.length - 1) this.registers.SP++;
    return this.memory[this.registers.SP];
  }

  fetch() {
    this.registers.MAR = this.registers.PC;
    this.registers.IR = this.memory[this.registers.MAR];
    this.registers.PC++;
    this.logMessage = `FETCH: Istruzione ${
      InstructionNames[this.registers.IR] || "DATA"
    } da @0x${this.registers.MAR.toString(16).padStart(2, "0")}`;
  }

  decodeAndExecute() {
    const instruction = this.registers.IR;
    let operand1;

    switch (instruction) {
      case InstructionSet.LOAD_A_VAL:
        operand1 = this.memory[this.registers.PC];
        this.registers.A = operand1;
        this.registers.PC++;
        break;
      case InstructionSet.LOAD_B_VAL:
        operand1 = this.memory[this.registers.PC];
        this.registers.B = operand1;
        this.registers.PC++;
        break;
      case InstructionSet.LOAD_A_MEM:
        operand1 = this.memory[this.registers.PC]; // Indirizzo
        this.registers.A = this.memory[operand1];
        this.registers.PC++;
        break;
      case InstructionSet.LOAD_B_MEM:
        operand1 = this.memory[this.registers.PC]; // Indirizzo
        this.registers.B = this.memory[operand1];
        this.registers.PC++;
        break;
      case InstructionSet.STORE_A:
        operand1 = this.memory[this.registers.PC]; // Indirizzo
        this.memory[operand1] = this.registers.A;
        this.registers.PC++;
        break;
      case InstructionSet.STORE_B:
        operand1 = this.memory[this.registers.PC]; // Indirizzo
        this.memory[operand1] = this.registers.B;
        this.registers.PC++;
        break;
      case InstructionSet.ADD:
        this.registers.A += this.registers.B;
        break;
      case InstructionSet.JMP:
        operand1 = this.memory[this.registers.PC];
        this.registers.PC = operand1;
        break;
      case InstructionSet.ENABLE_INTERRUPTS:
        this.registers.IE = 1;
        this.logMessage = "Interrupt Abilitati.";
        break;
      case InstructionSet.IRET:
        this.registers.PC = this.popFromStack();
        this.registers.IE = 1;
        this.logMessage = `IRET: Ritorno a @0x${this.registers.PC.toString(
          16
        ).padStart(2, "0")}. Interrupt riabilitati.`;
        break;
      case InstructionSet.PUSH_A:
        this.pushToStack(this.registers.A);
        break;
      case InstructionSet.POP_A:
        this.registers.A = this.popFromStack();
        break;
      case InstructionSet.PUSH_B:
        this.pushToStack(this.registers.B);
        break;
      case InstructionSet.POP_B:
        this.registers.B = this.popFromStack();
        break;
      case InstructionSet.HALT:
        this.halted = true;
        this.logMessage = "HALT: Esecuzione terminata.";
        break;
      case InstructionSet.NOOP:
        break;
      default:
        this.logMessage = `Istruzione sconosciuta: ${instruction}`;
        break;
    }
  }
}

// --- PROGRAMMA DI ESEMPIO ---
const MAIN_PROGRAM_START = 0x20;
const ISR_START = 0x80;
const COUNTER_ADDRESS = 0xf0; // Contatore per ISR
const VALUE_1_ADDR = 0xf1;
const RESULT_ADDRESS = 0xf4; // Indirizzo per il risultato del loop principale
const INCREMENT_VALUE_ADDR = 0xf5; // Valore per incrementare il risultato
const RESULT_ADDRESS_2 = 0xf6; // Indirizzo per il secondo contatore
const INCREMENT_VALUE_2_ADDR = 0xf7; // Valore per incrementare il secondo contatore

const ivt = [0x00, ISR_START];

const mainProgram = [
  // Setup iniziale
  InstructionSet.LOAD_A_VAL,
  0,
  InstructionSet.STORE_A,
  RESULT_ADDRESS,
  InstructionSet.LOAD_A_VAL,
  0,
  InstructionSet.STORE_A,
  RESULT_ADDRESS_2,
  InstructionSet.ENABLE_INTERRUPTS,
  // Loop principale (inizia a MAIN_PROGRAM_START + 9)
  // --- Incrementa il primo contatore ---
  InstructionSet.LOAD_A_MEM,
  RESULT_ADDRESS,
  InstructionSet.LOAD_B_MEM,
  INCREMENT_VALUE_ADDR,
  InstructionSet.ADD,
  InstructionSet.STORE_A,
  RESULT_ADDRESS,
  // --- Incrementa il secondo contatore ---
  InstructionSet.LOAD_A_MEM,
  RESULT_ADDRESS_2,
  InstructionSet.LOAD_B_MEM,
  INCREMENT_VALUE_2_ADDR,
  InstructionSet.ADD,
  InstructionSet.STORE_A,
  RESULT_ADDRESS_2,
  // --- Salta all'inizio del loop ---
  InstructionSet.JMP,
  MAIN_PROGRAM_START + 9,
];

const isr = [
  // Salva il contesto (i registri che verranno usati)
  InstructionSet.PUSH_A,
  InstructionSet.PUSH_B,
  // Corpo della ISR
  InstructionSet.LOAD_A_MEM,
  COUNTER_ADDRESS,
  InstructionSet.LOAD_B_MEM,
  VALUE_1_ADDR,
  InstructionSet.ADD,
  InstructionSet.STORE_A,
  COUNTER_ADDRESS,
  // Ripristina il contesto
  InstructionSet.POP_B,
  InstructionSet.POP_A,
  // Ritorna dall'interrupt
  InstructionSet.IRET,
];

const data = {
  [COUNTER_ADDRESS]: 0,
  [VALUE_1_ADDR]: 1,
  [RESULT_ADDRESS]: 0,
  [INCREMENT_VALUE_ADDR]: 1,
  [RESULT_ADDRESS_2]: 0,
  [INCREMENT_VALUE_2_ADDR]: 2,
};

const createAndLoadCPU = () => {
  const cpu = new CPU(256);
  cpu.loadProgram(ivt, CPU.INTERRUPT_VECTOR_TABLE_START);
  cpu.loadProgram(mainProgram, MAIN_PROGRAM_START);
  cpu.loadProgram(isr, ISR_START);

  for (const [addr, val] of Object.entries(data)) {
    cpu.memory[parseInt(addr)] = val;
  }

  cpu.registers.PC = MAIN_PROGRAM_START;
  return cpu;
};

// --- COMPONENTI REACT ---

const Register = ({ name, value, isHex = false }) => (
  <div className="bg-gray-700 p-2 rounded-md text-center">
    <div className="text-xs text-cyan-400 font-mono">{name}</div>
    <div className="text-xl font-bold font-mono">
      {isHex
        ? `0x${value.toString(16).padStart(2, "0")}`
        : String(value).padStart(2, "0")}
    </div>
  </div>
);

const MemoryCell = ({ address, value, isPC, isSP }) => {
  let bgColor = "bg-gray-800";
  let textColor = "text-white";
  if (isPC) {
    bgColor = "bg-green-500";
    textColor = "text-black";
  } else if (isSP) {
    bgColor = "bg-yellow-500";
    textColor = "text-black";
  } else if (
    address >= CPU.INTERRUPT_VECTOR_TABLE_START &&
    address < CPU.INTERRUPT_VECTOR_TABLE_START + ivt.length
  ) {
    bgColor = "bg-red-800";
  } else if (address === RESULT_ADDRESS) {
    bgColor = "bg-purple-600";
  } else if (address === RESULT_ADDRESS_2) {
    bgColor = "bg-teal-600";
  } else if (address === COUNTER_ADDRESS) {
    bgColor = "bg-indigo-600";
  }

  return (
    <div
      className={`w-14 h-12 flex flex-col items-center justify-center rounded ${bgColor} ${textColor} transition-colors duration-300`}>
      <div className="text-xs text-gray-400">
        0x{address.toString(16).padStart(2, "0")}
      </div>
      <div className="font-mono font-bold">{value}</div>
    </div>
  );
};

const ProgramView = ({ program, pc }) => {
  const formatOperand = (instr, operand) => {
    if (
      [
        InstructionSet.LOAD_A_MEM,
        InstructionSet.LOAD_B_MEM,
        InstructionSet.STORE_A,
        InstructionSet.STORE_B,
        InstructionSet.JMP,
      ].includes(instr)
    ) {
      return `@0x${operand.toString(16).padStart(2, "0")}`;
    }
    return operand;
  };

  return (
    <div className="bg-gray-800 p-4 rounded-lg h-full overflow-y-auto">
      <h3 className="text-lg font-bold text-cyan-400 mb-2">Programma</h3>
      <ul className="font-mono text-sm">
        {program.map((line, index) => (
          <li
            key={index}
            className={`p-1 rounded ${
              line.isSeparator ? "text-center text-gray-500 my-2" : ""
            } ${line.address === pc ? "bg-green-500 text-black" : ""}`}>
            {!line.isSeparator && (
              <span className="text-gray-500 mr-2">
                0x{line.address.toString(16).padStart(2, "0")}:
              </span>
            )}
            <span>{line.instruction}</span>
            {line.operand !== null && (
              <span className="ml-2 text-yellow-400">
                {formatOperand(line.instructionEnum, line.operand)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default function App() {
  const [cpu, setCpu] = useState(createAndLoadCPU);
  const [isRunning, setIsRunning] = useState(false);
  const [clockHz, setClockHz] = useState(4);
  const timerRef = useRef(null);

  const parsedProgram = useCallback(() => {
    const lines = [];
    const parseSection = (section, startAddr) => {
      let i = 0;
      let currentAddr = startAddr;
      while (i < section.length) {
        const instructionEnum = section[i];
        const instruction = InstructionNames[instructionEnum] || "DATA";
        let operand = null;
        let instructionSize = 1;

        if (
          [
            InstructionSet.LOAD_A_VAL,
            InstructionSet.LOAD_B_VAL,
            InstructionSet.LOAD_A_MEM,
            InstructionSet.LOAD_B_MEM,
            InstructionSet.STORE_A,
            InstructionSet.STORE_B,
            InstructionSet.JMP,
          ].includes(instructionEnum)
        ) {
          if (i + 1 < section.length) {
            operand = section[i + 1];
          }
          instructionSize = 2;
        }
        lines.push({
          address: currentAddr,
          instruction,
          operand,
          instructionEnum,
        });
        i += instructionSize;
        currentAddr += instructionSize;
      }
    };

    parseSection(mainProgram, MAIN_PROGRAM_START);
    lines.push({ isSeparator: true, instruction: "--- ISR ---" });
    parseSection(isr, ISR_START);

    return lines;
  }, []);

  const tick = useCallback(() => {
    setCpu((prevCpu) => {
      const newCpu = new CPU();
      newCpu.memory = new Uint8Array(prevCpu.memory);
      newCpu.registers = { ...prevCpu.registers };
      newCpu.halted = prevCpu.halted;
      newCpu.interruptQueue = [...prevCpu.interruptQueue];
      newCpu.tick();
      return newCpu;
    });
  }, []);

  useEffect(() => {
    if (isRunning && !cpu.halted) {
      clearInterval(timerRef.current);
      timerRef.current = setInterval(tick, 1000 / clockHz);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isRunning, clockHz, cpu.halted, tick]);

  const handleRunPause = () => setIsRunning(!isRunning);
  const handleStep = () => !isRunning && tick();
  const handleReset = () => {
    setIsRunning(false);
    setCpu(createAndLoadCPU());
  };
  const handleTriggerInterrupt = () => {
    setCpu((prevCpu) => {
      const newCpu = new CPU();
      newCpu.memory = new Uint8Array(prevCpu.memory);
      newCpu.registers = { ...prevCpu.registers };
      newCpu.halted = prevCpu.halted;
      newCpu.interruptQueue = [...prevCpu.interruptQueue];
      newCpu.requestInterrupt(Interrupts.TIMER);
      return newCpu;
    });
  };

  const { registers, memory, logMessage } = cpu;

  return (
    <div className="bg-gray-900 text-white min-h-screen font-sans p-4">
      <div className="container mx-auto">
        {/* <header className="text-center mb-4">
          <h1 className="text-4xl font-bold text-cyan-400">
            Simulatore CPU Interattivo
          </h1>
          <p className="text-gray-400">
            Visualizza il ciclo Fetch-Decode-Execute e la gestione degli
            interrupt.
          </p>
        </header> */}

        <div className="bg-gray-800 p-4 rounded-lg mb-4 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleRunPause}
              className={`cursor-pointer px-4 py-2 rounded-md font-bold w-24 ${
                isRunning ? "bg-yellow-500" : "bg-green-500"
              } text-black`}>
              {isRunning ? "Pausa" : "Avvia"}
            </button>
            <button
              type="button"
              onClick={handleStep}
              disabled={isRunning}
              className="cursor-pointer px-4 py-2 rounded-md font-bold bg-cyan-500 text-black disabled:bg-gray-600 disabled:cursor-not-allowed">
              Passo
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="cursor-pointer px-4 py-2 rounded-md font-bold bg-red-500 text-black">
              Reset
            </button>
            <button
              type="button"
              onClick={handleTriggerInterrupt}
              className="cursor-pointer px-4 py-2 rounded-md font-bold bg-blue-500 text-black">
              ⚡️ Trigger Interrupt
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="clock" className="font-bold">
              Clock:
            </label>
            <input
              type="range"
              id="clock"
              min="1"
              max="50"
              value={clockHz}
              onChange={(e) => setClockHz(Number(e.target.value))}
              className="w-48"
            />
            <span className="font-mono bg-gray-700 px-2 py-1 rounded">
              {clockHz} Hz
            </span>
          </div>
        </div>

        <div className="bg-gray-800 p-3 mb-4 rounded-lg font-mono text-sm text-yellow-300">
          <span className="font-bold text-gray-400">LOG: </span>
          {logMessage}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1 flex flex-col gap-4">
            <div className="bg-gray-800 p-4 rounded-lg">
              <h3 className="text-lg font-bold text-cyan-400 mb-2">Registri</h3>
              <div className="grid grid-cols-3 gap-2">
                <Register name="PC" value={registers.PC} isHex />
                <Register name="IR" value={registers.IR} />
                <Register name="SP" value={registers.SP} isHex />
                <Register name="A" value={registers.A} />
                <Register name="B" value={registers.B} />
                <Register name="IE" value={registers.IE} />
              </div>
            </div>
            <ProgramView program={parsedProgram()} pc={registers.PC} />
          </div>

          <div className="md:col-span-2 bg-gray-800 p-4 rounded-lg">
            <h3 className="text-lg font-bold text-cyan-400 mb-2">Memoria</h3>
            <div className="flex flex-wrap gap-1 justify-center">
              {Array.from({ length: 256 }).map((_, i) => (
                <MemoryCell
                  key={i}
                  address={i}
                  value={memory[i]}
                  isPC={i === registers.PC}
                  isSP={i === registers.SP}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
