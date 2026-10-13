import { login } from './auth.mjs';
import {profile,validateProfile} from './profile.mjs';
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_ITEMS = 250;
const MAX_FUTURE_MS = 5 * 60 * 1000;
const DEFAULT_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173';
const CATEGORIES = new Set(['work', 'life', 'growth']);

export const UPSERT_SQL = `
  INSERT INTO planner_items (id, updated_at, deleted, payload)
  SELECT json_extract(value, '$.id'), json_extract(value, '$.updatedAt'),
         json_extract(value, '$.deleted'), json_extract(value, '$.payload')
  FROM json_each(?) WHERE true
  ON CONFLICT(id) DO UPDATE SET
    updated_at = excluded.updated_at,
    deleted = excluded.deleted,
    payload = excluded.payload
  WHERE excluded.updated_at > planner_items.updated_at
    OR (excluded.updated_at = planner_items.updated_at AND (
      excluded.deleted > planner_items.deleted OR (
        excluded.deleted = planner_items.deleted AND excluded.payload > planner_items.payload
      )
    ))
`;
export const CURSOR_SQL = 'SELECT revision FROM sync_meta WHERE singleton = 1';
export const CHANGES_SQL = `
  SELECT payload, revision FROM planner_items
  WHERE revision > CASE WHEN ? > (SELECT revision FROM sync_meta WHERE singleton = 1) THEN 0 ELSE ? END
    OR id IN (SELECT value FROM json_each(?))
  ORDER BY revision ASC
`;

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function invalid(message) {
  throw new ApiError(400, 'invalid_request', message);
}

function stringField(value, name, max, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) {
    invalid(`${name} must be ${allowEmpty ? 'a' : 'a non-empty'} string of at most ${max} characters.`);
  }
  return value;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateItem(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Every item must be an object.');
  const id = stringField(value.id, 'id', 128);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) invalid('id may contain only letters, digits, underscores and hyphens.');
  const title = stringField(value.title, 'title', 200);
  if (!validDate(value.date)) invalid('date must be a real calendar date in YYYY-MM-DD format.');
  const dayOnly = value.startTime === '' && value.endTime === '';
  if (!dayOnly && (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.startTime) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.endTime))) {
    invalid('startTime and endTime must use HH:mm format.');
  }
  if (!dayOnly && value.endTime <= value.startTime) invalid('endTime must be later than startTime on the same date.');
  if (!CATEGORIES.has(value.category)) invalid('category must be work, life or growth.');
  const notes = stringField(value.notes, 'notes', 10000, true);
  if (typeof value.completed !== 'boolean' || typeof value.deleted !== 'boolean') invalid('completed and deleted must be booleans.');
  if (!Number.isSafeInteger(value.updatedAt) || value.updatedAt <= 0 || value.updatedAt > now + MAX_FUTURE_MS) {
    invalid('updatedAt must be a positive epoch millisecond integer, no more than five minutes in the future.');
  }
  if(value.createdAt!==undefined&&(!Number.isSafeInteger(value.createdAt)||value.createdAt<=0||value.createdAt>value.updatedAt))invalid('createdAt must be a positive timestamp not later than updatedAt.');
  if(value.time!==undefined&&value.time!==''&&(typeof value.time!=='string'||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.time)))invalid('time must use HH:mm format.');
  // The order is part of the version tie-break contract; ignore untrusted extra keys.
  return {
    id, title, date: value.date, startTime: value.startTime, endTime: value.endTime,
    category: value.category, notes, completed: value.completed,
    updatedAt: value.updatedAt, deleted: value.deleted,
    ...(value.createdAt===undefined?{}:{createdAt:value.createdAt}),
    ...(value.time===undefined?{}:{time:value.time}),
  };
}

export function canonicalPayload(item) {
  // ASCII serialization makes SQLite BINARY and JS lexical comparison identical,
  // including emoji and supplementary Unicode characters.
  return JSON.stringify(item).replace(/[\u007f-\uffff]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function validateSync(body, now = Date.now()) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('Request must be a JSON object.');
  if (!Number.isSafeInteger(body.since) || body.since < 0) invalid('since must be a non-negative integer.');
  if (!Array.isArray(body.items) || body.items.length > MAX_ITEMS) invalid(`items must be an array containing at most ${MAX_ITEMS} records.`);
  const items = body.items.map((item) => validateItem(item, now));
  if (new Set(items.map((item) => item.id)).size !== items.length) invalid('Duplicate item IDs are not allowed in one request.');
  return { since: body.since, items };
}

async function readJson(request) {
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw new ApiError(415, 'unsupported_media_type', 'Use Content-Type: application/json.');
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new ApiError(413, 'payload_too_large', 'Request body is larger than 2 MiB.');
  if (!request.body) invalid('Request body is required.');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ApiError(413, 'payload_too_large', 'Request body is larger than 2 MiB.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { invalid('Request body must contain valid UTF-8 JSON.'); }
}

async function authenticated(request, token) {
  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([^\s]{1,512})$/i.exec(authorization);
  if (!match) return false;
  // Hash to a fixed length and compare every byte, with no prefix/length early exit.
  const encode = new TextEncoder();
  const [provided, expected] = await Promise.all([
    crypto.subtle.digest('SHA-256', encode.encode(match[1])),
    crypto.subtle.digest('SHA-256', encode.encode(token)),
  ]);
  const left = new Uint8Array(provided);
  const right = new Uint8Array(expected);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

function originHeaders(request, env) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin',
  });
  const origin = request.headers.get('origin');
  if (!origin) return headers; // Native HTTP clients do not send an Origin header.
  const allowed = new Set((env.ALLOWED_ORIGINS ?? DEFAULT_ORIGINS).split(',').map((value) => value.trim()).filter(Boolean));
  if (origin === new URL(request.url).origin || allowed.has(origin) || (origin === 'null' && env.ALLOW_FILE_ORIGIN === 'true')) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    headers.set('Access-Control-Max-Age', '86400');
    return headers;
  }
  throw new ApiError(403, 'origin_not_allowed', 'This app origin is not allowed.');
}

export async function synchronize(db, since, items) {
  // A single transactional batch gives the returned cursor and rows one snapshot.
  // JSON bulk insert avoids D1's per-statement bound-parameter limit.
  const database = db.withSession ? db.withSession('first-primary') : db;
  // Check before accepting writes. Otherwise a restored database could catch up
  // to an obsolete cursor during this request and hide pre-existing records.
  const initial = await database.prepare(CURSOR_SQL).first();
  if (!Number.isSafeInteger(initial?.revision)) throw new Error('D1 migration is missing');
  const resetCursor = since > initial.revision;
  const effectiveSince = resetCursor ? 0 : since;
  const rows = items.map((item) => ({ id: item.id, updatedAt: item.updatedAt, deleted: item.deleted ? 1 : 0, payload: canonicalPayload(item) }));
  const statements = [];
  if (rows.length) statements.push(database.prepare(UPSERT_SQL).bind(JSON.stringify(rows)));
  statements.push(database.prepare(CURSOR_SQL));
  statements.push(database.prepare(CHANGES_SQL).bind(effectiveSince, effectiveSince, JSON.stringify(items.map((item) => item.id))));
  const results = await database.batch(statements);
  if (results.some((result) => result.success === false)) throw new Error('D1 transaction failed');
  const cursor = results.at(-2).results[0]?.revision;
  if (!Number.isSafeInteger(cursor)) throw new Error('D1 migration is missing');
  return {
    items: results.at(-1).results.map((row) => ({ ...JSON.parse(row.payload), revision: row.revision })),
    cursor, full: since === 0 || resetCursor, serverTime: Date.now(),
  };
}

export default {
  async fetch(request, env) {
    let headers;
    const respond = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
    try {
      headers = originHeaders(request, env);
      const path = new URL(request.url).pathname.replace(/\/$/, '');
      if (!['/api/sync', '/api/health', '/api/login', '/api/profile'].includes(path)) throw new ApiError(404, 'not_found', 'Endpoint not found.');
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (path === '/api/health' && request.method === 'GET') return respond({ service: 'liubai-sync', version: 1, ok: true });
      if (path === '/api/login' && request.method === 'POST') {
        const result = await login(request, env, await readJson(request));
        if(result.status !== 200) throw new ApiError(result.status,result.error,'Account authentication failed.');
        return respond({token:result.token,username:result.username});
      }
      if ((path !== '/api/sync' || request.method !== 'POST') && !(path==='/api/profile'&&['GET','PUT'].includes(request.method))) throw new ApiError(405, 'method_not_allowed', 'Unsupported method.');
      if (typeof env.SYNC_TOKEN !== 'string' || env.SYNC_TOKEN.length < 32 || env.SYNC_TOKEN.length > 512 || /\s/.test(env.SYNC_TOKEN) || !env.DB) {
        throw new ApiError(503, 'not_configured', 'Configure the DB binding and a 32–512 character SYNC_TOKEN secret.');
      }
      if (!(await authenticated(request, env.SYNC_TOKEN))) throw new ApiError(401, 'unauthorized', 'A valid personal sync token is required.');
      if(path==='/api/profile'){let value;if(request.method==='PUT'){try{value=validateProfile(await readJson(request));}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(400,'invalid_profile','Invalid avatar.');}}return respond(await profile(env.DB,value));}
      const { since, items } = validateSync(await readJson(request));
      return respond(await synchronize(env.DB, since, items));
    } catch (error) {
      headers ??= new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin' });
      if (error instanceof ApiError) return respond({ error: { code: error.code, message: error.message } }, error.status);
      // Do not log request bodies, bearer tokens, SQL parameters or private notes.
      console.error('Planner sync storage failure');
      return respond({ error: { code: 'storage_unavailable', message: 'Sync is temporarily unavailable. Keep local changes and retry.' } }, 503);
    }
  },
};
