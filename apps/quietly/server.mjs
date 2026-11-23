import { createHash, randomBytes, randomUUID, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const sessionLifetime = 12 * 60 * 60 * 1000;
const maxImageSize = 4 * 1024 * 1024;
const maxImageBase64 = Math.ceil(maxImageSize / 3) * 4;
const maxNoteRequest = maxImageBase64 + 300_000;
const loginWindow = 10 * 60 * 1000;
const derivePassword = promisify(scrypt);
const notePath = /^\/api\/notes\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(\/photo)?$/;
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/cover.webp", ["cover.webp", "image/webp"]],
  ["/favicon.svg", ["favicon.svg", "image/svg+xml"]],
]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readConfig() {
  const author = process.env.QUIET_AUTHOR_PASSWORD;
  const reader = process.env.QUIET_READER_PASSWORD;
  if ([author, reader].some((password) =>
    !password || password.trim().length < 12 || Buffer.byteLength(password) > 1024
  ) || author === reader) {
    throw new Error("Set two different passwords for quietly, each at least 12 characters long.");
  }

  const cookieSetting = process.env.QUIET_SECURE_COOKIE ?? "true";
  if (!["true", "false"].includes(cookieSetting)) {
    throw new Error("QUIET_SECURE_COOKIE must be true or false.");
  }
  const secureCookie = cookieSetting === "true";

  const configuredOrigin = process.env.QUIET_ORIGIN;
  let origin;
  if (configuredOrigin) {
    const url = new URL(configuredOrigin);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash || (secureCookie && url.protocol !== "https:")) {
      throw new Error("QUIET_ORIGIN must be a single origin, using HTTPS when secure cookies are enabled.");
    }
    origin = url.origin;
  }

  const passwordSalt = randomBytes(32);
  return {
    secureCookie,
    origin,
    cookieName: secureCookie ? "__Host-quiet_pages" : "quiet_pages",
    passwordSalt,
    authorDigest: scryptSync(author, passwordSalt, 64),
    readerDigest: scryptSync(reader, passwordSalt, 64),
    dataDirectory: resolve(process.env.QUIET_DATA_DIR ?? fileURLToPath(new URL("./data/", import.meta.url))),
    host: process.env.HOST ?? "0.0.0.0",
    port: Number(process.env.PORT ?? 8080),
  };
}

const config = readConfig();
process.umask(0o077);
mkdirSync(config.dataDirectory, { recursive: true, mode: 0o700 });
const database = new DatabaseSync(resolve(config.dataDirectory, "quiet-pages.sqlite"));
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    published_at TEXT,
    photo_type TEXT,
    photo BLOB
  ) STRICT;
`);

const noteColumns = `
  id, title, body, status, created_at AS createdAt, updated_at AS updatedAt,
  published_at AS publishedAt, photo IS NOT NULL AS hasPhoto
`;
const listNotes = database.prepare(`
  SELECT ${noteColumns} FROM notes
  WHERE ? = 'author' OR status = 'published'
  ORDER BY status = 'draft', CASE status WHEN 'published' THEN published_at ELSE updated_at END DESC, id
`);
const findNote = database.prepare(`SELECT ${noteColumns} FROM notes WHERE id = ?`);
const findPhoto = database.prepare(`
  SELECT photo, photo_type FROM notes WHERE id = ? AND (? = 'author' OR status = 'published')
`);
const insertNote = database.prepare(`
  INSERT INTO notes (id, title, body, status, created_at, updated_at, published_at, photo_type, photo)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  RETURNING ${noteColumns}
`);
const updateNote = database.prepare(`
  UPDATE notes SET title = ?, body = ?, status = ?, updated_at = ?, published_at = ?,
    photo_type = CASE WHEN ? THEN ? ELSE photo_type END,
    photo = CASE WHEN ? THEN ? ELSE photo END
  WHERE id = ?
  RETURNING ${noteColumns}
`);
const deleteNote = database.prepare("DELETE FROM notes WHERE id = ?");

// Sessions and abuse limits live in memory. Reading a note never updates them.
const sessions = new Map();
let failures = 0;
let failureWindowStarted = 0;
let loginsInFlight = 0;

function cookieToken(request) {
  const part = request.headers.cookie?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${config.cookieName}=`));
  const token = part?.slice(config.cookieName.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

function sessionKey(token) {
  return createHash("sha256").update(token).digest("hex");
}

function getRole(request) {
  const token = cookieToken(request);
  if (!token) return null;
  const key = sessionKey(token);
  const session = sessions.get(key);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(key);
    return null;
  }
  return session.role;
}

function clearSession(request) {
  const token = cookieToken(request);
  if (token) sessions.delete(sessionKey(token));
}

function setSessionCookie(response, token, maxAge) {
  const secure = config.secureCookie ? "; Secure" : "";
  response.setHeader("Set-Cookie",
    `${config.cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`
  );
}

async function login(request, response) {
  const { password } = await readJson(request, 8192);
  if (typeof password !== "string" || Buffer.byteLength(password) > 1024) {
    throw new HttpError(400, "Enter a password.");
  }
  const now = Date.now();
  if (now - failureWindowStarted >= loginWindow) {
    failures = 0;
    failureWindowStarted = now;
  }
  if (failures >= 15 || loginsInFlight >= 4) {
    response.setHeader("Retry-After", String(failures >= 15
      ? Math.max(1, Math.ceil((failureWindowStarted + loginWindow - now) / 1000))
      : 1));
    throw new HttpError(429, "Too many attempts. Try again in a little while.");
  }

  loginsInFlight++;
  try {
    const digest = await derivePassword(password, config.passwordSalt, 64);
    const isAuthor = timingSafeEqual(digest, config.authorDigest);
    const isReader = timingSafeEqual(digest, config.readerDigest);
    if (!isAuthor && !isReader) {
      failures++;
      throw new HttpError(401, "That password didn't match.");
    }

    const role = isAuthor ? "author" : "reader";
    clearSession(request);
    for (const [key, session] of sessions) {
      if (session.expiresAt <= now) sessions.delete(key);
    }
    if (sessions.size >= 128) sessions.delete(sessions.keys().next().value);
    const token = randomBytes(32).toString("base64url");
    sessions.set(sessionKey(token), { role, expiresAt: Date.now() + sessionLifetime });
    setSessionCookie(response, token, sessionLifetime / 1000);
    return sendJson(response, 200, { role });
  } finally {
    loginsInFlight--;
  }
}

function checkOrigin(request) {
  const scheme = config.secureCookie ? "https" : "http";
  const expected = config.origin ?? `${scheme}://${request.headers.host}`;
  if (request.headers.origin !== expected) {
    throw new HttpError(403, "This request must come from quietly.");
  }
}

async function readJson(request, limit = maxNoteRequest) {
  const type = request.headers["content-type"]?.split(";")[0].trim().toLowerCase();
  if (type !== "application/json") throw new HttpError(415, "Send a JSON request.");
  if (Number(request.headers["content-length"]) > limit) throw new HttpError(413, "That upload is too large.");

  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, "That upload is too large.");
    chunks.push(chunk);
  }

  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "The request was not valid JSON.");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "Send a JSON object.");
  }
  return value;
}

function hasImageSignature(type, data) {
  switch (type) {
    case "image/jpeg":
      return data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    case "image/png":
      return data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
    case "image/webp":
      return data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP";
    default:
      return false;
  }
}

function readPhoto(photo) {
  if (photo === undefined || photo === null) return photo;
  if (typeof photo !== "object" || typeof photo.type !== "string" || typeof photo.data !== "string") {
    throw new HttpError(400, "Choose a JPEG, PNG, or WebP photo.");
  }
  if (photo.data.length > maxImageBase64) throw new HttpError(413, "Choose a photo under 4 MB.");
  const data = Buffer.from(photo.data, "base64");
  if (data.length > maxImageSize) throw new HttpError(413, "Choose a photo under 4 MB.");
  if (data.toString("base64") !== photo.data || !hasImageSignature(photo.type, data)) {
    throw new HttpError(400, "Choose a JPEG, PNG, or WebP photo.");
  }
  return { type: photo.type, data };
}

function serializeNote(note) {
  return { ...note, hasPhoto: Boolean(note.hasPhoto) };
}

async function writeNote(request, response, id) {
  const input = await readJson(request);
  const { title = "", body, status } = input;
  if (typeof title !== "string" || title.length > 120 || typeof body !== "string" ||
    body.length > 40_000 || !["draft", "published"].includes(status)) {
    throw new HttpError(400, "Use a title up to 120 characters and a note up to 40,000 characters.");
  }

  const photo = readPhoto(input.photo);
  const existing = id ? findNote.get(id) : null;
  if (id && !existing) throw new HttpError(404, "That note is no longer here.");
  const hasPhoto = photo === undefined ? Boolean(existing?.hasPhoto) : photo !== null;
  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  if (status === "published" && !trimmedTitle && !trimmedBody && !hasPhoto) {
    throw new HttpError(400, "Add a title, note, or photo before publishing.");
  }

  const now = new Date().toISOString();
  const publishedAt = existing?.publishedAt ?? (status === "published" ? now : null);
  const photoType = photo?.type ?? null;
  const photoData = photo?.data ?? null;
  const replacePhoto = Number(photo !== undefined);
  const note = existing
    ? updateNote.get(trimmedTitle, trimmedBody, status, now, publishedAt, replacePhoto, photoType,
      replacePhoto, photoData, id)
    : insertNote.get(randomUUID(), trimmedTitle, trimmedBody, status, now, now, publishedAt, photoType, photoData);
  return sendJson(response, existing ? 200 : 201, { note: serializeNote(note) });
}

function setPrivateHeaders(response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Security-Policy",
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; " +
    "connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  );
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  if (config.secureCookie) response.setHeader("Strict-Transport-Security", "max-age=31536000");
}

function send(response, status, type, content) {
  response.writeHead(status, { "Content-Type": type });
  response.end(content);
}

function sendJson(response, status, value) {
  return send(response, status, "application/json; charset=utf-8", JSON.stringify(value));
}

async function handle(request, response) {
  setPrivateHeaders(response);
  const { method } = request;
  const { pathname } = new URL(request.url, "http://localhost");
  const canRead = method === "GET" || method === "HEAD";
  if (canRead && pathname === "/healthz") {
    return send(response, 200, "text/plain; charset=utf-8", "ok\n");
  }
  if (canRead && staticFiles.has(pathname)) {
    const [filename, type] = staticFiles.get(pathname);
    const data = await readFile(new URL(`./public/${filename}`, import.meta.url));
    return send(response, 200, type, data);
  }
  if (method === "POST" || method === "PUT" || method === "DELETE") checkOrigin(request);
  if (method === "POST" && pathname === "/api/login") return login(request, response);
  if (method === "POST" && pathname === "/api/logout") {
    await readJson(request, 8192);
    clearSession(request);
    setSessionCookie(response, "", 0);
    return sendJson(response, 200, {});
  }

  const role = getRole(request);
  if (method === "GET" && pathname === "/api/session") return sendJson(response, 200, { role });

  const match = notePath.exec(pathname);
  if (pathname !== "/api/notes" && !match) throw new HttpError(404, "Page not found.");
  if (!role) throw new HttpError(401, "Sign in to open quietly.");
  if (method === "GET" && pathname === "/api/notes") {
    return sendJson(response, 200, { notes: listNotes.all(role).map(serializeNote) });
  }
  if (canRead && match?.[2]) {
    const photo = findPhoto.get(match[1], role);
    if (!photo?.photo) throw new HttpError(404, "That photo is no longer here.");
    return send(response, 200, photo.photo_type, photo.photo);
  }
  if (!canRead && role !== "author") throw new HttpError(403, "Only the author can change notes.");
  if (method === "POST" && pathname === "/api/notes") return writeNote(request, response);
  if (method === "PUT" && match && !match[2]) return writeNote(request, response, match[1]);
  if (method === "DELETE" && match && !match[2]) {
    if (!deleteNote.run(match[1]).changes) throw new HttpError(404, "That note is no longer here.");
    return sendJson(response, 200, {});
  }
  throw new HttpError(404, "Page not found.");
}

createServer({ headersTimeout: 10_000, requestTimeout: 30_000 }, (request, response) => {
  handle(request, response).catch((error) => {
    if (response.headersSent || response.destroyed) return response.destroy();
    request.resume();
    if (error.status === 413) response.setHeader("Connection", "close");
    if (error instanceof HttpError) return sendJson(response, error.status, { error: error.message });
    if (error.code === "ENOENT") return sendJson(response, 404, { error: "Page not found." });
    return sendJson(response, 500, { error: "Couldn't finish that request. Please try again." });
  });
}).listen(config.port, config.host, function () {
  console.log(`quietly is listening on port ${this.address().port}.`);
});
