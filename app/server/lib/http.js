/**
 * Minimal HTTP plumbing: a pattern router, body parsing, cookies, static files.
 * Zero dependencies on purpose so the project runs with plain `node server/index.js`.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const bad = (msg, details) => new HttpError(400, msg, details);
export const unauthorized = (msg = 'Chua dang nhap') => new HttpError(401, msg);
export const forbidden = (msg = 'Khong co quyen truy cap') => new HttpError(403, msg);
export const notFound = (msg = 'Khong tim thay') => new HttpError(404, msg);

/** Router with `/path/:param` patterns. Longest literal prefix wins by insertion order. */
export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    const keys = [];
    const source = pattern
      .split('/')
      .map((part) => {
        if (!part.startsWith(':')) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        keys.push(part.slice(1));
        return '([^/]+)';
      })
      .join('/');
    this.routes.push({ method, regex: new RegExp(`^${source}/?$`), keys, handler });
    return this;
  }

  get(p, h) { return this.add('GET', p, h); }
  post(p, h) { return this.add('POST', p, h); }
  put(p, h) { return this.add('PUT', p, h); }
  patch(p, h) { return this.add('PATCH', p, h); }
  delete(p, h) { return this.add('DELETE', p, h); }

  match(method, pathname) {
    let pathExists = false;
    for (const route of this.routes) {
      const m = route.regex.exec(pathname);
      if (!m) continue;
      pathExists = true;
      if (route.method !== method) continue;
      const params = {};
      route.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { handler: route.handler, params };
    }
    if (pathExists) throw new HttpError(405, 'Phuong thuc khong duoc ho tro');
    return null;
  }
}

const MAX_BODY = 2 * 1024 * 1024;

export async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw bad('Du lieu gui len qua lon');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw bad('JSON khong hop le');
  }
}

export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload ?? null);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

export function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function setCookie(res, name, value, { maxAge = 60 * 60 * 24 * 30, httpOnly = true, path = '/' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `Max-Age=${maxAge}`, 'SameSite=Lax'];
  if (httpOnly) parts.push('HttpOnly');
  // Chạy thật (NODE_ENV=production, sau HTTPS): cookie chỉ gửi qua kết nối mã hoá.
  // Chạy production trên máy nội bộ không có HTTPS thì đặt EKKO_INSECURE_COOKIE=1.
  if (process.env.NODE_ENV === 'production' && process.env.EKKO_INSECURE_COOKIE !== '1') parts.push('Secure');
  const existing = res.getHeader('set-cookie');
  const list = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
  list.push(parts.join('; '));
  res.setHeader('set-cookie', list);
}

export function clearCookie(res, name) {
  setCookie(res, name, '', { maxAge: 0 });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
};

/** Serves files under `root`, refusing any path that escapes it. */
export async function serveStatic(root, urlPath, req, res) {
  let rel = normalize(decodeURIComponent(urlPath)).replace(/^([/\\.])+/, '');
  if (rel.split(sep).includes('..')) return false;
  let full = join(root, rel);

  let info;
  try {
    info = await stat(full);
  } catch {
    return false;
  }
  if (info.isDirectory()) {
    full = join(full, 'index.html');
    try {
      info = await stat(full);
    } catch {
      return false;
    }
  }

  const etag = `W/"${info.size}-${Math.floor(info.mtimeMs)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { etag });
    res.end();
    return true;
  }

  const ext = extname(full).toLowerCase();
  const immutable = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.woff2'].includes(ext);
  const headers = {
    'content-type': MIME[ext] || 'application/octet-stream',
    etag,
    'cache-control': immutable ? 'public, max-age=604800' : 'no-cache',
    'accept-ranges': 'bytes',
  };

  // Tải từng đoạn (Range): Safari / iPhone chỉ phát video khi server trả được
  // một khoảng byte (206), và tua video cũng cần.
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
    let end = range[1] && range[2] ? Number(range[2]) : info.size - 1;
    end = Math.min(end, info.size - 1);
    if (start > end || start >= info.size) {
      res.writeHead(416, { 'content-range': `bytes */${info.size}` });
      res.end();
      return true;
    }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${info.size}`, 'content-length': end - start + 1 });
    if (req.method === 'HEAD') return res.end(), true;
    createReadStream(full, { start, end }).pipe(res);
    return true;
  }

  res.writeHead(200, { ...headers, 'content-length': info.size });
  if (req.method === 'HEAD') return res.end(), true;
  createReadStream(full).pipe(res);
  return true;
}
