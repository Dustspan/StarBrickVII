/**
 * Utility functions for StarBrickVII
 */

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

export function hexDump(data: Uint8Array): string {
  const lines: string[] = [];
  for (let i = 0; i < data.length; i += 16) {
    const addr = i.toString(16).padStart(8, '0');
    const hex = Array.from(data.slice(i, i + 16))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    const ascii = Array.from(data.slice(i, i + 16))
      .map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.')
      .join('');
    lines.push(`${addr}  ${hex.padEnd(47)}  |${ascii}|`);
  }
  return lines.join('\n');
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function detectMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    txt: 'text/plain', json: 'application/json', xml: 'application/xml',
    html: 'text/html', css: 'text/css', js: 'text/javascript', ts: 'text/typescript',
    md: 'text/markdown', csv: 'text/csv', pdf: 'application/pdf',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon',
    zip: 'application/zip', gz: 'application/gzip', tar: 'application/x-tar',
    rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4',
    webm: 'video/webm', avi: 'video/x-msvideo', mkv: 'video/x-matroska',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    bin: 'application/octet-stream', exe: 'application/octet-stream', dll: 'application/octet-stream',
    so: 'application/octet-stream', dylib: 'application/octet-stream',
    wasm: 'application/wasm', sh: 'application/x-sh', py: 'text/x-python',
    rs: 'text/x-rust', c: 'text/x-c', cpp: 'text/x-c++', h: 'text/x-c',
    java: 'text/x-java', go: 'text/x-go', rb: 'text/x-ruby', php: 'text/x-php',
    sql: 'application/sql', yaml: 'text/yaml', yml: 'text/yaml', toml: 'text/plain',
    ini: 'text/plain', cfg: 'text/plain', conf: 'text/plain', log: 'text/plain',
  };
  return map[ext] || 'application/octet-stream';
}

export function isTextType(mime: string): boolean {
  return mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml' || mime === 'application/yaml';
}
