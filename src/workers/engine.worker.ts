/**
 * StarBrickVII Engine Worker
 * 
 * Loads WASM engines, caches instances, processes encode/decode.
 */

type Fn = (...args: number[]) => number;

interface CachedEngine {
  exports: Record<string, Fn>;
  memory: WebAssembly.Memory;
  info: { id: string; name: string; desc: string; capabilities: { binarySafe: boolean; selfInverse: boolean; reversible: boolean; stateful: boolean } };
}

const engineCache = new Map<string, CachedEngine>();
let currentEngineId: string | null = null;

interface Msg {
  id: string;
  type: 'load' | 'encode' | 'decode' | 'switch' | 'abort';
  payload: {
    wasmUrl?: string;
    engineId?: string;
    text?: string;
    data?: ArrayBuffer;
    chunkIndex?: number;
    totalChunks?: number;
  };
}

function send(id: string, type: string, payload?: Record<string, unknown>, error?: string) {
  self.postMessage({ id, type, payload, error });
}

function readStr(mem: WebAssembly.Memory, ptr: number, len: number): string {
  if (!ptr || !len) return '';
  return new TextDecoder().decode(new Uint8Array(mem.buffer, ptr, len));
}

function writeStr(mem: WebAssembly.Memory, alloc: Fn, str: string) {
  const bytes = new TextEncoder().encode(str);
  const ptr = alloc(bytes.length);
  if (!ptr) throw new Error('alloc failed');
  new Uint8Array(mem.buffer).set(bytes, ptr);
  return { ptr, len: bytes.length };
}

function writeBin(mem: WebAssembly.Memory, alloc: Fn, data: Uint8Array) {
  const ptr = alloc(data.length);
  if (!ptr) throw new Error('alloc failed');
  new Uint8Array(mem.buffer).set(data, ptr);
  return { ptr, len: data.length };
}

async function loadEngine(msgId: string, wasmUrl: string) {
  try {
    send(msgId, 'progress', { progress: 0.1 });

    const res = await fetch(wasmUrl);
    if (!res.ok) throw new Error(`WASM fetch ${res.status}`);

    send(msgId, 'progress', { progress: 0.4 });
    const buf = await res.arrayBuffer();

    send(msgId, 'progress', { progress: 0.7 });
    const { instance } = await WebAssembly.instantiate(buf);
    const exp = instance.exports as Record<string, Fn | WebAssembly.Memory>;

    const memory = exp.memory as WebAssembly.Memory;
    const alloc = exp.sb_alloc as Fn;
    const _free = exp.sb_free as Fn;
    const outLenPtr = alloc(4);

    const idPtr = (exp.sb_get_id as Fn)(outLenPtr);
    const idLen = new Uint32Array(memory.buffer, outLenPtr, 1)[0];
    const id = readStr(memory, idPtr, idLen);

    const namePtr = (exp.sb_get_name as Fn)(outLenPtr);
    const nameLen = new Uint32Array(memory.buffer, outLenPtr, 1)[0];
    const name = readStr(memory, namePtr, nameLen);

    const descPtr = (exp.sb_get_desc as Fn)(outLenPtr);
    const descLen = new Uint32Array(memory.buffer, outLenPtr, 1)[0];
    const desc = readStr(memory, descPtr, descLen);

    const info = {
      id,
      name,
      desc,
      capabilities: {
        binarySafe: (exp.sb_is_binary_safe as Fn)() === 1,
        selfInverse: (exp.sb_is_self_inverse as Fn)() === 1,
        reversible: (exp.sb_is_reversible as Fn)() === 1,
        stateful: (exp.sb_is_stateful as Fn)() === 1,
      },
    };

    const fnExports: Record<string, Fn> = {};
    for (const [k, v] of Object.entries(exp)) {
      if (typeof v === 'function') fnExports[k] = v as Fn;
    }

    engineCache.set(id, { exports: fnExports, memory, info });
    currentEngineId = id;

    send(msgId, 'loaded', { info });
  } catch (err) {
    send(msgId, 'error', undefined, err instanceof Error ? err.message : 'Load failed');
  }
}

function switchEngine(msgId: string, engineId: string) {
  if (engineCache.has(engineId)) {
    currentEngineId = engineId;
    send(msgId, 'loaded', { info: engineCache.get(engineId)!.info });
  } else {
    send(msgId, 'error', undefined, `Engine ${engineId} not loaded`);
  }
}

function processText(msgId: string, text: string, op: 'encode' | 'decode') {
  try {
    if (!currentEngineId) { send(msgId, 'error', undefined, 'No engine'); return; }
    const engine = engineCache.get(currentEngineId);
    if (!engine) { send(msgId, 'error', undefined, 'Engine missing'); return; }

    const { exports, memory } = engine;
    const alloc = exports.sb_alloc;
    const free = exports.sb_free;
    const fn = exports[op === 'encode' ? 'sb_encode' : 'sb_decode'];
    if (!fn) { send(msgId, 'error', undefined, `${op} not supported`); return; }

    const { ptr, len } = writeStr(memory, alloc, text);
    const outLenPtr = alloc(4);
    const resultPtr = fn(ptr, len, outLenPtr);
    const resultLen = new Uint32Array(memory.buffer, outLenPtr, 1)[0];

    if (!resultPtr || !resultLen) {
      free(ptr, len);
      send(msgId, 'result', { result: '' });
      return;
    }

    const result = readStr(memory, resultPtr, resultLen);
    free(ptr, len);
    free(outLenPtr, 4);

    send(msgId, 'result', { result });
  } catch (err) {
    send(msgId, 'error', undefined, err instanceof Error ? err.message : 'Process failed');
  }
}

function processBinary(msgId: string, data: ArrayBuffer, op: 'encode' | 'decode', progress: number) {
  try {
    if (!currentEngineId) { send(msgId, 'error', undefined, 'No engine'); return; }
    const engine = engineCache.get(currentEngineId);
    if (!engine) { send(msgId, 'error', undefined, 'Engine missing'); return; }

    const { exports, memory } = engine;
    const alloc = exports.sb_alloc;
    const free = exports.sb_free;
    const fn = exports[op === 'encode' ? 'sb_encode' : 'sb_decode'];
    if (!fn) { send(msgId, 'error', undefined, `${op} not supported`); return; }

    const bytes = new Uint8Array(data);
    if (bytes.length === 0) {
      send(msgId, 'chunk_result', { data: new ArrayBuffer(0), progress });
      return;
    }

    const { ptr, len } = writeBin(memory, alloc, bytes);
    const outLenPtr = alloc(4);
    const resultPtr = fn(ptr, len, outLenPtr);
    const resultLen = new Uint32Array(memory.buffer, outLenPtr, 1)[0];

    if (!resultPtr || !resultLen) {
      free(ptr, len);
      send(msgId, 'chunk_result', { data: new ArrayBuffer(0), progress });
      return;
    }

    const resultBytes = new Uint8Array(memory.buffer, resultPtr, resultLen).slice();
    free(ptr, len);
    free(outLenPtr, 4);

    send(msgId, 'chunk_result', { data: resultBytes.buffer, progress });
  } catch (err) {
    send(msgId, 'error', undefined, err instanceof Error ? err.message : 'Process failed');
  }
}

self.onmessage = async (event: MessageEvent<Msg>) => {
  const { id, type, payload } = event.data;

  switch (type) {
    case 'load':
      if (payload.wasmUrl) await loadEngine(id, payload.wasmUrl);
      break;
    case 'switch':
      if (payload.engineId) switchEngine(id, payload.engineId);
      break;
    case 'encode':
      if (payload.text) processText(id, payload.text, 'encode');
      else if (payload.data) {
        const p = payload.chunkIndex !== undefined && payload.totalChunks
          ? (payload.chunkIndex + 1) / payload.totalChunks : 0.5;
        processBinary(id, payload.data, 'encode', p);
      }
      break;
    case 'decode':
      if (payload.text) processText(id, payload.text, 'decode');
      else if (payload.data) {
        const p = payload.chunkIndex !== undefined && payload.totalChunks
          ? (payload.chunkIndex + 1) / payload.totalChunks : 0.5;
        processBinary(id, payload.data, 'decode', p);
      }
      break;
    case 'abort':
      send(id, 'error', undefined, 'Aborted');
      break;
    default:
      send(id, 'error', undefined, `Unknown type: ${type}`);
  }
};

export {};
