const PRESET_ENGINES = [
  'engines/base64.wasm',
  'engines/hex.wasm',
  'engines/binary.wasm'
];

const ENGINE_DOC = `# StarBrickVII WASM Engine Standard v1.0

## Overview
Engines are WASM modules exporting specific functions for the host.

## Required Exports
| Function | Signature | Description |
|----------|-----------|-------------|
| sb_get_id | (outLenPtr) -> ptr | Unique engine ID string |
| sb_get_name | (outLenPtr) -> ptr | Display name |
| sb_get_desc | (outLenPtr) -> ptr | Description |
| sb_is_binary_safe | () -> i32 | 1 if binary-safe |
| sb_is_self_inverse | () -> i32 | 1 if encode=decode |
| sb_is_reversible | () -> i32 | 1 if has decode |
| sb_alloc | (size) -> ptr | Memory allocation |
| sb_free | (ptr, size) | Memory free |
| sb_encode | (ptr, len, outLenPtr) -> ptr | Encode function |
| sb_decode | (ptr, len, outLenPtr) -> ptr | Decode (if reversible) |

## Validation
Engines are validated on load:
1. Check required exports.
2. Encode "StarBrickVII_VALIDATION_123".
3. Decode result (if applicable).
4. Compare with original.

## Build
\`\`\`bash
cargo build --target wasm32-unknown-unknown --release
\`\`\`
`;

// ==STATE================================================================
const S = {
  engines: new Map(),           // engineId -> { name, desc, binarySafe, selfInverse, reversible, worker }
  currentEngineId: null,
  mode: 'encode',
  inputType: null,               // 'text' or 'file'
  inputData: null,               // for text: string; for file: File object
  outputData: null,              // result as Blob (always Blob)
  history: [],                   // command history (strings)
  histIdx: -1,
  imode: 'cmd',                  // 'cmd', 'select', 'pager'
  selectOpts: [],
  selectCb: null,
  pager: null,
  pendingRequests: new Map(),    // requestId -> { resolve, reject, chunks: [] } (for streaming, currently not fully used)
  nextRequestId: 0
};

// ==DOM ELEMENTS========================================================
const $out = document.getElementById('out');
const $ti = document.getElementById('ti');
const $ps = document.getElementById('ps');
const $wasmFi = document.getElementById('wasm-fi');
const $dataFi = document.getElementById('data-fi');
const $modal = document.getElementById('modal');
const $modalText = document.getElementById('modal-text');
const $modalTitle = document.getElementById('modal-title');
const $modalOk = document.getElementById('modal-ok');
const $modalCancel = document.getElementById('modal-cancel');
const $modalX = document.getElementById('modal-x');

// ==UTILITIES===========================================================
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const print = (t, c = '') => {
  const e = document.createElement('div');
  e.className = 'ln ' + c;
  e.innerHTML = t;
  $out.appendChild(e);
  $out.scrollTop = $out.scrollHeight;
  // 限制最大行数，防止内存爆炸（简化虚拟滚动）
  while ($out.children.length > 500) $out.removeChild($out.firstChild);
};

const clear = () => $out.innerHTML = '';
const setPs = s => $ps.textContent = s;
const clearTi = () => $ti.value = '';

// ==BACKGROUND ANIMATION (流星)=========================================
(function() {
  const c = document.getElementById('bg-canvas');
  if (!c) return;
  const ctx = c.getContext('2d');
  let W = 0, H = 0;
  const meteors = [];
  const stars = [];
  const MAX_METEORS = 15;

  function resize() {
    W = c.width = innerWidth;
    H = c.height = innerHeight;
    stars.length = 0;
    for (let i = 0; i < 100; i++) {
      stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.2, a: Math.random() });
    }
  }

  class Meteor {
    constructor() { this.reset(true); }
    reset(init) {
      this.x = Math.random() * W * 1.2;
      this.y = init ? Math.random() * H : -50;
      this.len = Math.random() * 80 + 40;
      this.spd = Math.random() * 8 + 4;
      this.ang = Math.PI * 0.2;
      this.a = Math.random() * 0.5 + 0.3;
      this.w = Math.random() * 1.5 + 0.5;
      const r = Math.random();
      if (r < 0.6) this.clr = [255, 255, 255];
      else if (r < 0.8) this.clr = [255, 107, 74];
      else this.clr = [100, 180, 255];
    }
    update() {
      this.x -= Math.cos(this.ang) * this.spd;
      this.y += Math.sin(this.ang) * this.spd;
      if (this.y > H + 100 || this.x < -100) this.reset(false);
    }
    draw() {
      const ex = this.x + Math.cos(this.ang) * this.len;
      const ey = this.y - Math.sin(this.ang) * this.len;
      const [r, g, b] = this.clr;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(ex, ey);
      const gdt = ctx.createLinearGradient(this.x, this.y, ex, ey);
      gdt.addColorStop(0, `rgba(${r},${g},${b},${this.a})`);
      gdt.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.strokeStyle = gdt;
      ctx.lineWidth = this.w;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.w * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${this.a})`;
      ctx.fill();
    }
  }

  function init() {
    resize();
    for (let i = 0; i < MAX_METEORS; i++) meteors.push(new Meteor());
    window.addEventListener('resize', resize);
    animate();
  }

  function animate() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, W, H);
    stars.forEach(s => {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,200,200,${s.a})`;
      ctx.fill();
    });
    meteors.forEach(m => { m.update(); m.draw(); });
    requestAnimationFrame(animate);
  }

  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) init();
})();

// ==WORKER MANAGEMENT===================================================
function createWorkerForEngine(wasmUrl) {
  const worker = new Worker('engine-worker.js');
  return new Promise((resolve, reject) => {
    const requestId = S.nextRequestId++;
    const handler = (e) => {
      if (e.data.id === requestId) {
        if (e.data.type === 'loaded') {
          resolve({ worker, info: e.data.payload });
        } else if (e.data.type === 'error') {
          reject(new Error(e.data.error));
        }
        worker.removeEventListener('message', handler);
      }
    };
    worker.addEventListener('message', handler);
    worker.postMessage({ id: requestId, type: 'load', payload: { wasmUrl } });
  });
}

async function loadWasmEngine(url, isPreset = false) {
  const name = typeof url === 'string' ? url.split('/').pop() : url.name;
  try {
    const { worker, info } = await createWorkerForEngine(url);
    const engine = {
      id: info.id,
      name: info.name,
      desc: info.desc,
      binarySafe: info.binarySafe,
      selfInverse: info.selfInverse,
      reversible: info.reversible,
      isPreset,
      worker
    };
    if (S.engines.has(engine.id)) {
      print(`<span class="warn">Overwritten: ${engine.id}</span>`);
      S.engines.get(engine.id).worker.terminate();
    }
    S.engines.set(engine.id, engine);
    return { ok: true, engine };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function loadPresets() {
  print('<span class="info">Loading preset engines...</span>');
  for (const path of PRESET_ENGINES) {
    const r = await loadWasmEngine(path, true);
    if (r.ok) print(`<span class="ok">Ready: ${r.engine.name}</span>`);
    else print(`<span class="err">Fail: ${path} (${r.error})</span>`);
  }
  print(`<span class="dim">${S.engines.size} engine(s) registered</span>`);
}

// ==ENCODE/DECODE REQUEST (文本/小数据)==================================
function callEngine(engineId, type, input) {
  return new Promise((resolve, reject) => {
    const engine = S.engines.get(engineId);
    if (!engine) return reject(new Error('Engine not found'));
    const requestId = S.nextRequestId++;
    const chunks = [];
    const handler = (e) => {
      if (e.data.id === requestId) {
        if (e.data.type === 'chunk') {
          chunks.push(e.data.payload);
        } else if (e.data.type === 'result') {
          const full = new Uint8Array(chunks.reduce((acc, c) => acc + c.byteLength, 0));
          let offset = 0;
          for (const c of chunks) {
            full.set(new Uint8Array(c), offset);
            offset += c.byteLength;
          }
          resolve(new Blob([full]));
          engine.worker.removeEventListener('message', handler);
        } else if (e.data.type === 'error') {
          reject(new Error(e.data.error));
          engine.worker.removeEventListener('message', handler);
        }
      }
    };
    engine.worker.addEventListener('message', handler);
    engine.worker.postMessage({ id: requestId, type, payload: { chunk: input, isLast: true } }, [input]);
  });
}

// ==大文件分块处理 (仅用于支持流式的引擎，如 binary 编码)=====================
async function processFile(file, engineId, mode) {
  const CHUNK_SIZE = 64 * 1024; // 64KB
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  print(`<span class="info">Processing ${file.name} (${file.size} bytes) in ${totalChunks} chunks...</span>`);
  const engine = S.engines.get(engineId);
  if (!engine) throw new Error('Engine not found');
  return new Promise((resolve, reject) => {
    let offset = 0;
    let chunkIndex = 0;
    const resultChunks = [];
    const reader = new FileReader();
    const processNextChunk = () => {
      if (offset >= file.size) return;
      const chunk = file.slice(offset, offset + CHUNK_SIZE);
      reader.readAsArrayBuffer(chunk);
    };
    reader.onload = (e) => {
      const chunkData = e.target.result;
      const requestId = S.nextRequestId++;
      const handler = (msg) => {
        if (msg.data.id === requestId) {
          if (msg.data.type === 'chunk') {
            resultChunks.push(msg.data.payload);
          } else if (msg.data.type === 'result') {
            const full = new Uint8Array(resultChunks.reduce((acc, c) => acc + c.byteLength, 0));
            let pos = 0;
            for (const c of resultChunks) {
              full.set(new Uint8Array(c), pos);
              pos += c.byteLength;
            }
            resolve(new Blob([full]));
            engine.worker.removeEventListener('message', handler);
          } else if (msg.data.type === 'error') {
            reject(new Error(msg.data.error));
            engine.worker.removeEventListener('message', handler);
          }
        }
      };
      engine.worker.addEventListener('message', handler);
      engine.worker.postMessage({
        id: requestId,
        type: mode,
        payload: {
          chunk: chunkData,
          isLast: offset + CHUNK_SIZE >= file.size,
          totalChunks
        }
      }, [chunkData]);
      offset += CHUNK_SIZE;
      chunkIndex++;
      processNextChunk();
    };
    reader.onerror = () => reject(new Error('File read error'));
    processNextChunk();
  });
}

// ==MODAL (文本输入)====================================================
function showModal(title, defaultText = '') {
  return new Promise(resolve => {
    $modalTitle.textContent = title;
    $modalText.value = defaultText;
    $modal.classList.add('active');
    $modalText.focus();
    const close = val => {
      $modal.classList.remove('active');
      resolve(val);
      $ti.focus();
      $modalOk.onclick = null;
      $modalCancel.onclick = null;
      $modalX.onclick = null;
    };
    $modalOk.onclick = () => close($modalText.value);
    $modalCancel.onclick = () => close(null);
    $modalX.onclick = () => close(null);
    $modalText.onkeydown = e => {
      if (e.key === 'Enter' && e.ctrlKey) close($modalText.value);
    };
  });
}

// ==PAGER (分页显示)====================================================
function showPaged(text, h = 14) {
  const lines = text.split('\n');
  const pages = Math.ceil(lines.length / h);
  if (pages <= 1) {
    print(text);
    return;
  }
  S.pager = { lines, h, pages, cur: 0 };
  renderPage();
  S.imode = 'pager';
}

function renderPage() {
  const p = S.pager;
  const s = p.cur * p.h;
  const e = Math.min(s + p.h, p.lines.length);
  const old = $out.querySelector('.pager-bar');
  if (old) old.remove();
  p.lines.slice(s, e).forEach(l => print(l));
  const bar = document.createElement('div');
  bar.className = 'pager-bar';
  bar.innerHTML = `<span class="dim">${s+1}-${e} / ${p.lines.length}</span>
    <div class="pager-btns">
      <button class="pbtn" id="pprev" ${p.cur===0?'disabled':''}>Prev</button>
      <button class="pbtn" id="pnext" ${p.cur>=p.pages-1?'disabled':''}>Next</button>
      <button class="pbtn" id="pclose">Close</button>
    </div>`;
  $out.appendChild(bar);
  $out.scrollTop = $out.scrollHeight;
  document.getElementById('pprev').onclick = () => { if (p.cur > 0) { p.cur--; renderPage(); } };
  document.getElementById('pnext').onclick = () => { if (p.cur < p.pages - 1) { p.cur++; renderPage(); } };
  document.getElementById('pclose').onclick = closePager;
}

function closePager() {
  S.pager = null;
  S.imode = 'cmd';
  const bar = $out.querySelector('.pager-bar');
  if (bar) bar.remove();
  setPs('$');
}

// ==SELECT (交互选择列表)================================================
function enterSelect(opts, cb, title = 'Select:') {
  S.imode = 'select';
  S.selectOpts = opts;
  S.selectCb = cb;
  print(title, 'prompt');
  opts.forEach((o, i) => print(
    `<div class="select-item" data-idx="${i}">
       <span class="select-num">[${i+1}]</span>
       <span class="select-label">${esc(o.label)}</span>
     </div>`
  ));
  print('<span class="dim">Click or enter number</span>');
  setPs('?');
}

function handleSelectClick(e) {
  if (S.imode !== 'select') return;
  const item = e.target.closest('.select-item');
  if (!item) return;
  const idx = parseInt(item.dataset.idx);
  if (!isNaN(idx) && S.selectCb) {
    const sel = S.selectOpts[idx];
    const cb = S.selectCb;
    S.imode = 'cmd';
    S.selectOpts = [];
    S.selectCb = null;
    setPs('$');
    cb(sel);
  }
}
$out.addEventListener('click', handleSelectClick);

// ==增强的引擎验证（自检自查）============================================
async function validateEngine(eng) {
  const testStr = 'StarBrickVII_VALIDATION_123';
  const testBinary = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x7F, 0x80, 0xFF, 0x00, 0x0A, 0x0D, 0x20, 0x41, 0x5A, 0x61, 0x7A, 0x00]);
  try {
    // 1. 测试编码至少产生输出
    const enc = await eng.encode(testStr);
    if (!enc.output || !enc.output.length) 
      return { ok: false, error: 'Encode produced no output' };

    // 2. 如果引擎声称可逆，测试解码后匹配原始字符串
    if (eng.reversible) {
      const dec = await eng.decode(enc.output);
      if (!dec.output) return { ok: false, error: 'Decode failed' };
      const outStr = typeof dec.output === 'string' ? dec.output : new TextDecoder().decode(dec.output);
      if (outStr !== testStr) return { ok: false, error: 'Reversible mismatch' };
    }

    // 3. 如果引擎声称自逆，测试 encode(encode(x)) == x
    if (eng.selfInverse) {
      const enc1 = await eng.encode(testStr);
      if (!enc1.output) return { ok: false, error: 'Self-inverse encode failed' };
      const enc2 = await eng.encode(enc1.output);
      if (!enc2.output) return { ok: false, error: 'Self-inverse second encode failed' };
      const outStr2 = typeof enc2.output === 'string' ? enc2.output : new TextDecoder().decode(enc2.output);
      if (outStr2 !== testStr) return { ok: false, error: 'Self-inverse mismatch' };
    }

    // 4. 如果引擎声称二进制安全，测试处理二进制数据
    if (eng.binarySafe) {
      const encBin = await eng.encode(testBinary);
      if (!encBin.output) return { ok: false, error: 'Binary-safe encode failed' };
      
      if (eng.reversible || eng.selfInverse) {
        const decBin = await eng.decode(encBin.output);
        if (!decBin.output) return { ok: false, error: 'Binary-safe decode failed' };
        const decBytes = decBin.output instanceof Uint8Array ? decBin.output : new Uint8Array(decBin.output);
        if (decBytes.length !== testBinary.length) return { ok: false, error: 'Binary-safe size mismatch' };
        for (let i = 0; i < testBinary.length; i++) {
          if (decBytes[i] !== testBinary[i]) return { ok: false, error: 'Binary-safe content mismatch' };
        }
      }
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ==COMMANDS (内置命令)==================================================
const cmds = {
  help() {
    print('<span class="hl">StarBrickVII</span> <span class="comment">// Encoding Toolkit</span><br>');
    print('<span class="prompt">Commands:</span><br>' +
      '  <span class="hl">list</span>       <span class="comment"># List engines</span><br>' +
      '  <span class="hl">use</span> [id]   <span class="comment"># Select engine</span><br>' +
      '  <span class="hl">import</span>     <span class="comment"># Import WASM</span><br>' +
      '  <span class="hl">result</span>     <span class="comment"># View/Download</span><br>' +
      '  <span class="hl">doc</span>        <span class="comment"># Display dev doc</span><br>' +
      '  <span class="hl">clear</span>      <span class="comment"># Clear screen</span><br>' +
      '<span class="dim">Flags: B=binary_safe S=self_inverse R=reversible</span>');
  },
  list() {
    print('<span class="prompt">Engines:</span>');
    let i = 1;
    S.engines.forEach(e => {
      const tag = e.isPreset ? '<span class="dim">[preset]</span>' : '<span class="warn">[custom]</span>';
      const f = `${e.binarySafe?'B':'-'}${e.selfInverse?'S':'-'}${e.reversible?'R':'-'}`;
      print(`<div class="select-item" data-id="${e.id}">
        <span class="select-num">[${i}]</span>${e.name} ${tag} <span class="dim">[${f}] ${e.id}</span>
      </div>`);
      i++;
    });
  },
  use(arg) {
    if (!arg) {
      const opts = Array.from(S.engines.values()).map(e => ({ value: e.id, label: `${e.name} (${e.id})` }));
      opts.push({ value: '__IMPORT__', label: 'Import WASM...' });
      enterSelect(opts, sel => {
        if (sel.value === '__IMPORT__') cmds.import();
        else selectEngine(sel.value);
      });
      return;
    }
    const n = parseInt(arg);
    const keys = Array.from(S.engines.keys());
    if (!isNaN(n) && n >= 1 && n <= keys.length) {
      selectEngine(keys[n-1]);
      return;
    }
    const eng = S.engines.get(arg) || Array.from(S.engines.values()).find(e => e.name.toLowerCase() === arg.toLowerCase());
    if (eng) selectEngine(eng.id);
    else print(`<span class="err">Not found: ${esc(arg)}</span>`);
  },
  import() {
    print('<span class="info">Select WASM file...</span>');
    $wasmFi.click();
  },
  result() {
    if (!S.outputData) {
      print('<span class="err">No result</span>');
      return;
    }
    enterSelect([
      { value: 'view', label: 'View (paged)' },
      { value: 'download', label: 'Download' },
      { value: 'hex', label: 'Hex dump' }
    ], sel => {
      S.imode = 'cmd';
      setPs('$');
      if (sel.value === 'view') {
        if (S.outputData instanceof Blob) {
          // 尝试作为文本显示，但给出警告
          const reader = new FileReader();
          reader.onload = () => {
            const text = new TextDecoder().decode(reader.result);
            print('<span class="warn">Displaying as text. If you see garbage, it may be binary data; use "hex" instead.</span>');
            showPaged(text);
          };
          reader.readAsArrayBuffer(S.outputData);
        } else {
          showPaged(S.outputData);
        }
      } else if (sel.value === 'download') {
        const blob = S.outputData instanceof Blob ? S.outputData : new Blob([S.outputData]);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `result_${Date.now()}.out`;
        a.click();
        URL.revokeObjectURL(a.href);
        print('<span class="ok">Downloaded</span>');
      } else {
        // hex dump
        if (S.outputData instanceof Blob) {
          const reader = new FileReader();
          reader.onload = () => {
            const bytes = new Uint8Array(reader.result);
            let hex = '';
            for (let i = 0; i < Math.min(bytes.length, 10240); i++) {
              hex += bytes[i].toString(16).padStart(2, '0') + ((i+1) % 16 === 0 ? '\n' : ' ');
            }
            if (bytes.length > 10240) hex += '\n... (truncated)';
            showPaged(hex.trim());
          };
          reader.readAsArrayBuffer(S.outputData);
        } else {
          const bytes = new TextEncoder().encode(S.outputData);
          let hex = '';
          for (let i = 0; i < Math.min(bytes.length, 10240); i++) {
            hex += bytes[i].toString(16).padStart(2, '0') + ((i+1) % 16 === 0 ? '\n' : ' ');
          }
          if (bytes.length > 10240) hex += '\n... (truncated)';
          showPaged(hex.trim());
        }
      }
    }, 'Result:');
  },
  doc() {
    showPaged(ENGINE_DOC, 20);
  },
  clear() {
    clear();
  }
};

// ==选择引擎后的流程=====================================================
async function selectEngine(id) {
  const eng = S.engines.get(id);
  if (!eng) return;
  S.currentEngineId = id;
  print(`<span class="ok">Engine: ${eng.name}</span>`);
  let metaHtml = `<div class="meta-box">
    <div class="meta-row"><span class="meta-k">ID:</span><span class="meta-v">${esc(eng.id)}</span></div>`;
  if (eng.desc) metaHtml += `<div class="meta-row"><span class="meta-k">Desc:</span><span class="meta-v">${esc(eng.desc)}</span></div>`;
  metaHtml += `<div class="meta-row"><span class="meta-k">Binary Safe:</span><span class="meta-v ${eng.binarySafe}">${eng.binarySafe}</span></div>
    <div class="meta-row"><span class="meta-k">Self-Inverse:</span><span class="meta-v ${eng.selfInverse}">${eng.selfInverse}</span></div>
    <div class="meta-row"><span class="meta-k">Reversible:</span><span class="meta-v ${eng.reversible}">${eng.reversible}</span></div>
  </div>`;
  print(metaHtml);
  const opts = [{ value: 'encode', label: 'Encode' }];
  if (eng.reversible || eng.selfInverse) opts.push({ value: 'decode', label: 'Decode' });
  enterSelect(opts, sel => { S.mode = sel.value; askInputSource(); }, 'Operation:');
}

function askInputSource() {
  enterSelect([
    { value: 'text', label: 'Text input (Popup)' },
    { value: 'file', label: 'File input' }
  ], sel => {
    S.inputType = sel.value;
    if (sel.value === 'text') {
      showModal('Input Text').then(text => {
        if (text === null) {
          print('<span class="warn">Cancelled</span>');
          reset();
        } else {
          S.inputData = text;
          confirmOp();
        }
      });
    } else {
      print('<span class="info">Select file...</span>');
      $dataFi.click();
    }
  }, 'Input source:');
}

async function confirmOp() {
  const preview = typeof S.inputData === 'string'
    ? S.inputData.substring(0, 50) + (S.inputData.length > 50 ? '...' : '')
    : `${S.inputData.name} (${S.inputData.size} bytes)`;
  print('<span class="prompt">Confirm:</span>');
  print(`<span class="dim">Mode:</span> ${S.mode}`);
  print(`<span class="dim">Input:</span> ${esc(preview)}`);
  enterSelect([{ value: 'yes', label: 'Execute' }, { value: 'no', label: 'Cancel' }], sel => {
    if (sel.value === 'yes') execute();
    else { print('<span class="warn">Cancelled</span>'); reset(); }
  }, 'Proceed?');
}

async function execute() {
  print('<span class="info">Processing...</span>');
  try {
    const engine = S.engines.get(S.currentEngineId);
    if (!engine) throw new Error('Engine not found');
    
    let resultBlob;
    if (S.inputType === 'text') {
      const input = new TextEncoder().encode(S.inputData).buffer;
      resultBlob = await callEngine(S.currentEngineId, S.mode, input);
    } else {
      const nonStreamingEngines = ['hex', 'base64']; // 需要完整输入的引擎
      if (S.mode === 'decode' && nonStreamingEngines.includes(engine.id)) {
        const arrayBuffer = await S.inputData.arrayBuffer();
        resultBlob = await callEngine(S.currentEngineId, S.mode, arrayBuffer);
      } else {
        resultBlob = await processFile(S.inputData, S.currentEngineId, S.mode);
      }
    }
    
    // 始终保存为 Blob，不再自动转换为文本
    S.outputData = resultBlob;
    print(`<span class="ok">${S.mode.toUpperCase()} COMPLETE</span>`);
    print(`<span class="dim">Output: ${resultBlob.size} bytes</span>`);
    setTimeout(() => cmds.result(), 500);
  } catch (e) {
    print(`<span class="err">Error: ${esc(e.message)}</span>`);
  }
  reset();
}

function reset() {
  S.currentEngineId = null;
  S.inputType = null;
  S.inputData = null;
  S.imode = 'cmd';
  S.selectCb = null;
  S.selectOpts = [];
  setPs('$');
}

// ==命令行输入处理=======================================================
function handleInput(raw) {
  const v = raw.trim();
  
  if (S.pager) {
    const c = v.toLowerCase();
    if (c === 'n' && S.pager.cur < S.pager.pages - 1) {
      S.pager.cur++;
      renderPage();
    } else if (c === 'p' && S.pager.cur > 0) {
      S.pager.cur--;
      renderPage();
    } else if (c === 'q') {
      closePager();
    }
    clearTi();
    return;
  }
  
  if (S.imode === 'select') {
    const n = parseInt(v);
    if (!isNaN(n) && n >= 1 && n <= S.selectOpts.length) {
      const sel = S.selectOpts[n-1];
      const cb = S.selectCb;
      S.imode = 'cmd';
      S.selectOpts = [];
      S.selectCb = null;
      setPs('$');
      cb(sel);
    } else {
      print('<span class="err">Invalid</span>');
    }
    clearTi();
    return;
  }
  
  let cmdPart = v;
  let commentPart = '';
  const hashIdx = v.indexOf('#');
  if (hashIdx !== -1) {
    cmdPart = v.substring(0, hashIdx).trim();
    commentPart = v.substring(hashIdx);
  }

  print(`<span class="ps">$ </span>${esc(cmdPart)} ${commentPart ? `<span class="comment">${esc(commentPart)}</span>` : ''}`, 'user-cmd');
  
  if (!cmdPart) {
    clearTi();
    return;
  }
  
  S.history.push(v);
  S.histIdx = S.history.length;
  
  const [cmd, ...args] = cmdPart.split(/\s+/);
  const arg = args.join(' ');
  
  if (cmds[cmd]) cmds[cmd](arg);
  else print(`<span class="err">Unknown: ${esc(cmd)}</span>`);
  
  clearTi();
}

// ==事件绑定============================================================
$ti.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    handleInput($ti.value);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (S.histIdx > 0) {
      S.histIdx--;
      $ti.value = S.history[S.histIdx];
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (S.histIdx < S.history.length - 1) {
      S.histIdx++;
      $ti.value = S.history[S.histIdx];
    } else {
      S.histIdx = S.history.length;
      $ti.value = '';
    }
  } else if (e.key === 'Tab') {
    e.preventDefault();
    const m = Object.keys(cmds).filter(c => c.startsWith($ti.value.toLowerCase()));
    if (m.length === 1) $ti.value = m[0];
  }
});

$wasmFi.addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  if (!f.name.endsWith('.wasm')) {
    print('<span class="err">File must be .wasm</span>');
    $wasmFi.value = '';
    return;
  }
  print(`<span class="info">Loading ${esc(f.name)}...</span>`);
  const url = URL.createObjectURL(f);
  const r = await loadWasmEngine(url, false);
  URL.revokeObjectURL(url);
  if (r.ok) print(`<span class="ok">Imported: ${r.engine.name}</span>`);
  else print(`<span class="err">Failed: ${r.error}</span>`);
  $wasmFi.value = '';
});

$dataFi.addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  if (!S.currentEngineId) {
    print('<span class="err">No engine selected</span>');
    $dataFi.value = '';
    return;
  }
  const eng = S.engines.get(S.currentEngineId);
  if (!eng.binarySafe && f.type && !f.type.startsWith('text/')) {
    print('<span class="err">BLOCKED: Binary file detected and engine not binary-safe</span>');
    $dataFi.value = '';
    return;
  }
  print(`<span class="info">${esc(f.name)} (${f.size} bytes)</span>`);
  S.inputData = f;
  confirmOp();
  $dataFi.value = '';
});

document.addEventListener('click', () => {
  if (!$modal.classList.contains('active') && S.imode !== 'select') {
    $ti.focus();
  }
});

// ==启动================================================================
print('<span class="hl">StarBrickVII</span> <span class="comment">// Ready</span>');
loadPresets();