/**
 * Utility functions for StarBrickVII
 */

/**
 * Formats a file size in bytes to a human-readable string
 * 
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);
  
  // Use 0 decimal places for bytes, 1 for KB, 2 for larger units
  const decimals = i === 0 ? 0 : i === 1 ? 1 : 2;
  
  return `${size.toFixed(decimals)} ${units[i]}`;
}

/**
 * Formats a duration in milliseconds to a human-readable string
 * 
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "1.5s" or "500ms")
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Estimates remaining time based on progress
 * 
 * @param elapsed - Elapsed time in ms
 * @param progress - Progress as a fraction (0-1)
 * @returns Estimated remaining time in ms
 */
export function estimateTimeRemaining(elapsed: number, progress: number): number {
  if (progress <= 0 || progress >= 1) return 0;
  const totalEstimated = elapsed / progress;
  return Math.round(totalEstimated - elapsed);
}

/**
 * Generates a hex dump of binary data
 * 
 * @param data - Binary data to dump
 * @param maxBytes - Maximum bytes to include (default 1024)
 * @returns Hex dump string
 */
export function hexDump(data: Uint8Array, maxBytes = 1024): string {
  const truncated = data.length > maxBytes;
  const bytes = truncated ? data.slice(0, maxBytes) : data;
  
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += bytes[i].toString(16).padStart(2, '0');
    if ((i + 1) % 16 === 0) {
      result += '\n';
    } else {
      result += ' ';
    }
  }
  
  if (truncated) {
    result += `\n... (${data.length - maxBytes} more bytes)`;
  }
  
  return result.trim();
}

/**
 * Detects the MIME type of a file based on its extension
 * 
 * @param filename - File name with extension
 * @returns MIME type string or 'application/octet-stream' if unknown
 */
export function detectMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  
  const mimeTypes: Record<string, string> = {
    // Images
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    bmp: 'image/bmp',
    
    // Text
    txt: 'text/plain',
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    json: 'application/json',
    xml: 'application/xml',
    md: 'text/markdown',
    csv: 'text/csv',
    
    // Documents
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    
    // Archives
    zip: 'application/zip',
    gz: 'application/gzip',
    tar: 'application/x-tar',
    
    // Audio/Video
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    mp4: 'video/mp4',
    webm: 'video/webm',
    
    // Binary
    wasm: 'application/wasm',
    bin: 'application/octet-stream',
  };
  
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

/**
 * Checks if a MIME type is an image
 * 
 * @param mimeType - MIME type string
 * @returns True if the type is an image
 */
export function isImageType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/**
 * Checks if a MIME type is text-based
 * 
 * @param mimeType - MIME type string
 * @returns True if the type is text-based
 */
export function isTextType(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml' ||
    mimeType === 'application/javascript'
  );
}

/**
 * Creates a download link for a Blob
 * 
 * @param blob - Blob to download
 * @param filename - Suggested filename
 */
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

/**
 * Copies text to clipboard
 * 
 * @param text - Text to copy
 * @returns Promise that resolves when copied
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

/**
 * Debounces a function call
 * 
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Generates a unique ID
 * 
 * @returns Unique string ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Clamps a value between min and max
 * 
 * @param value - Value to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between two values
 * 
 * @param start - Start value
 * @param end - End value
 * @param t - Interpolation factor (0-1)
 * @returns Interpolated value
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Checks if the user prefers reduced motion
 * 
 * @returns True if reduced motion is preferred
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Gets the file extension from a filename
 * 
 * @param filename - File name
 * @returns Extension without the dot, or empty string
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
}
