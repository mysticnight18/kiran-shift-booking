import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { overlaps } from '../src/shifts.mjs';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'));
const today = new Date();
const serveWeb = process.argv.includes('--web');
const webRoot = fileURLToPath(new URL('../dist', import.meta.url));
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function servePage(path, request, response) {
  const relativePath = path === '/' ? '/index.html' : decodeURIComponent(path);
  const filePath = resolve(webRoot, '.' + relativePath);
  if (!filePath.startsWith(webRoot + sep)) return false;

  const content = readFileSync(filePath);
  const contentType = contentTypes[extname(filePath)] || 'application/octet-stream';
  response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
  response.end(request.method === 'HEAD' ? undefined : content);
  return true;
}

function shiftTime(hour, minute, dayOffset) {
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayOffset, hour, minute).getTime();
}

const shifts = fixtures.map(([area, startHour, startMinute, startDay, endHour, endMinute, endDay]) => ({
  id: randomUUID(),
  booked: false,
  area,
  startTime: shiftTime(startHour, startMinute, startDay),
  endTime: shiftTime(endHour, endMinute, endDay),
}));

const server = createServer((request, response) => {
  function send(status, payload) {
    response.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify(payload));
  }

  if (request.method === 'OPTIONS') return send(200, {});
  const path = new URL(request.url, 'http://localhost').pathname;
  if (request.method === 'GET' && /^\/shifts\/?$/.test(path)) return send(200, shifts);

  const match = path.match(/^\/shifts\/([a-f\d-]+)(?:\/(book|cancel))?\/?$/i);
  if (!match) {
    if (serveWeb && ['GET', 'HEAD'].includes(request.method)) {
      try {
        if (servePage(path, request, response)) return;
      } catch (error) {
        if (error instanceof URIError) return send(400, { message: 'Invalid URL.' });
        if (!['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code)) {
          return send(500, { message: 'Could not read the web build.' });
        }
      }
    }
    return send(404, { message: 'Route not found.' });
  }

  const [, id, action] = match;
  const shift = shifts.find(item => item.id === id);
  if (!shift) return send(404, { message: 'Shift not found.' });
  if (request.method === 'GET' && !action) return send(200, shift);
  if (request.method !== 'POST' || !action) return send(405, { message: 'Method not allowed.' });

  if (action === 'cancel') {
    if (!shift.booked) return send(400, { message: 'This shift has already been cancelled.' });
    shift.booked = false;
    return send(200, shift);
  }

  if (shift.booked) return send(400, { message: 'This shift is already booked.' });
  if (shift.startTime <= Date.now()) return send(400, { message: 'This shift has already started.' });
  if (shifts.some(item => item.booked && overlaps(item, shift))) {
    return send(400, { message: 'This shift overlaps with one of your bookings.' });
  }

  shift.booked = true;
  return send(200, shift);
});

const port = Number(process.env.PORT || 8080);
const host = process.env.API_HOST || (serveWeb ? '0.0.0.0' : '127.0.0.1');
server.listen(port, host, () => console.log(`Shift ${serveWeb ? 'web app and API' : 'API'} listening on http://${host}:${port}`));
