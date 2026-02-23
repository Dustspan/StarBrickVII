let wasmExports = null;
let engineInfo = null;

self.onmessage = async (e) => {
  const { id, type, payload } = e.data;
  try {
    if (type === 'load') {
      const { wasmUrl } = payload;
      const response = await fetch(wasmUrl);
      const wasmBytes = await response.arrayBuffer();
      const module = await WebAssembly.compile(wasmBytes);
      const instance = await WebAssembly.instantiate(module);
      const exports = instance.exports;
      
      // 验证必要导出
      const required = ['sb_encode', 'sb_alloc', 'sb_free', 'sb_get_id', 'sb_is_binary_safe', 'sb_is_self_inverse', 'sb_is_reversible', 'memory'];
      for (const r of required) if (!exports[r]) throw new Error(`Missing export: ${r}`);
      
      // 读取引擎元数据
      const readStr = (ptr, lenPtr) => {
        const len = new Uint32Array(exports.memory.buffer, lenPtr, 1)[0];
        if (len === 0) return '';
        return new TextDecoder().decode(new Uint8Array(exports.memory.buffer, ptr, len));
      };
      
      const idLenPtr = exports.sb_alloc(4);
      const idPtr = exports.sb_get_id(idLenPtr);
      const engineId = readStr(idPtr, idLenPtr);
      exports.sb_free(idLenPtr, 4);
      
      let engineName = engineId;
      if (exports.sb_get_name) {
        const nameLenPtr = exports.sb_alloc(4);
        const namePtr = exports.sb_get_name(nameLenPtr);
        engineName = readStr(namePtr, nameLenPtr);
        exports.sb_free(nameLenPtr, 4);
      }
      
      let engineDesc = '';
      if (exports.sb_get_desc) {
        const descLenPtr = exports.sb_alloc(4);
        const descPtr = exports.sb_get_desc(descLenPtr);
        engineDesc = readStr(descPtr, descLenPtr);
        exports.sb_free(descLenPtr, 4);
      }
      
      const binarySafe = exports.sb_is_binary_safe() === 1;
      const selfInverse = exports.sb_is_self_inverse() === 1;
      const reversible = exports.sb_is_reversible() === 1;
      
      engineInfo = { id: engineId, name: engineName, desc: engineDesc, binarySafe, selfInverse, reversible };
      wasmExports = exports;
      
      self.postMessage({ id, type: 'loaded', payload: engineInfo });
    } else if (type === 'encode' || type === 'decode') {
      if (!wasmExports) throw new Error('Engine not loaded');
      const fnName = type === 'encode' ? 'sb_encode' : 'sb_decode';
      const { chunk, isLast, totalChunks } = payload;
      
      // 分配输入内存
      const inPtr = wasmExports.sb_alloc(chunk.byteLength);
      if (!inPtr) throw new Error('sb_alloc failed');
      new Uint8Array(wasmExports.memory.buffer).set(new Uint8Array(chunk), inPtr);
      
      const outLenPtr = wasmExports.sb_alloc(4);
      if (!outLenPtr) {
        wasmExports.sb_free(inPtr, chunk.byteLength);
        throw new Error('sb_alloc for outLenPtr failed');
      }
      
      try {
        const outPtr = wasmExports[fnName](inPtr, chunk.byteLength, outLenPtr);
        const outLen = new Uint32Array(wasmExports.memory.buffer, outLenPtr, 1)[0];
        if (outPtr && outLen) {
          const result = new Uint8Array(wasmExports.memory.buffer, outPtr, outLen).slice();
          self.postMessage({ id, type: 'chunk', payload: result.buffer }, [result.buffer]);
        }
        if (isLast) {
          self.postMessage({ id, type: 'result' });
        }
      } finally {
        wasmExports.sb_free(inPtr, chunk.byteLength);
        wasmExports.sb_free(outLenPtr, 4);
      }
    }
  } catch (err) {
    self.postMessage({ id, type: 'error', error: err.message });
  }
};