import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const authorPassword = "test-author-passphrase";
const readerPassword = "test-reader-passphrase";
const serverPath = fileURLToPath(new URL("./server.mjs", import.meta.url));
const photo = {
  type: "image/png",
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/n1sAAAAASUVORK5CYII=",
};

async function availablePort() {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const { port } = listener.address();
  await new Promise((resolve, reject) => {
    listener.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function startServer(dataDir) {
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      QUIET_DATA_DIR: dataDir,
      QUIET_SECURE_COOKIE: "false",
      QUIET_ORIGIN: origin,
      QUIET_AUTHOR_PASSWORD: authorPassword,
      QUIET_READER_PASSWORD: readerPassword,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (chunk) => {
    stderr += chunk;
  });
  const exited = once(child, "exit");
  const stop = async () => {
    child.kill();
    await exited;
  };
  try {
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline && child.exitCode === null) {
      const ready = await fetch(origin + "/healthz", {
        signal: AbortSignal.timeout(500),
      }).catch(() => null);
      if (ready?.ok) {
        await ready.text();
        return { origin, stop };
      }
      await delay(50);
    }
    throw new Error(`quietly did not start. ${stderr.trim()}`);
  } catch (error) {
    await stop();
    throw error;
  }
}

function request(origin, path, { method = "GET", cookie, json } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (method !== "GET") headers.origin = origin;
  if (json !== undefined) headers["content-type"] = "application/json";
  return fetch(origin + path, {
    method,
    headers,
    body: json === undefined ? undefined : JSON.stringify(json),
  });
}

async function login(origin, password, role) {
  const response = await request(origin, "/api/login", {
    method: "POST",
    json: { password },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).role, role);
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie, "A session cookie should be set after sign-in");
  assert.ok(cookie.split(";").some((part) => part.trim() === "HttpOnly"), "The session cookie should be HttpOnly");
  assert.ok(cookie.split(";").some((part) => part.trim() === "SameSite=Strict"), "The session cookie should be SameSite=Strict");
  return cookie.split(";", 1)[0];
}

test("the reader can open published notes and photos only", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "quietly-test-"));
  let server;
  t.after(async () => {
    await server?.stop();
    await rm(dataDir, { recursive: true, force: true });
  });
  server = await startServer(dataDir);
  let { origin } = server;

  const anonymousSession = await request(origin, "/api/session");
  assert.deepEqual(await anonymousSession.json(), { role: null });
  assert.equal((await request(origin, "/api/notes")).status, 401);
  const author = await login(origin, authorPassword, "author");
  const reader = await login(origin, readerPassword, "reader");

  const draft = { title: "A test note", body: "One line.\nAnother line.", status: "draft" };
  const created = await request(origin, "/api/notes", {
    method: "POST", cookie: author, json: { ...draft, photo },
  });
  assert.ok(created.ok);
  const { note } = await created.json();
  assert.equal(note.status, "draft");
  assert.equal(note.hasPhoto, true);
  const notePath = `/api/notes/${note.id}`;
  const photoPath = notePath + "/photo";

  assert.equal((await request(origin, photoPath)).status, 401);
  assert.deepEqual(await (await request(origin, "/api/notes", { cookie: reader })).json(), { notes: [] });
  assert.equal((await request(origin, photoPath, { cookie: reader })).status, 404);
  assert.equal((await request(origin, "/api/notes", {
    method: "POST", cookie: reader, json: draft,
  })).status, 403);

  const published = await request(origin, notePath, {
    method: "PUT", cookie: author, json: { ...draft, status: "published" },
  });
  assert.ok(published.ok);
  const readerNotes = await request(origin, "/api/notes", { cookie: reader });
  assert.match(readerNotes.headers.get("cache-control") ?? "", /\bno-store\b/);
  const { notes } = await readerNotes.json();
  assert.equal(notes.length, 1);
  assert.equal(notes[0].id, note.id);
  assert.equal(notes[0].body, draft.body);
  const readerPhoto = await request(origin, photoPath, { cookie: reader });
  assert.equal(readerPhoto.status, 200);
  assert.equal(readerPhoto.headers.get("content-type"), photo.type);
  assert.match(readerPhoto.headers.get("cache-control") ?? "", /\bno-store\b/);
  assert.deepEqual(Buffer.from(await readerPhoto.arrayBuffer()), Buffer.from(photo.data, "base64"));
  assert.equal((await request(origin, notePath, {
    method: "DELETE", cookie: reader,
  })).status, 403);

  assert.ok((await request(origin, notePath, {
    method: "PUT", cookie: author, json: draft,
  })).ok);
  assert.deepEqual(await (await request(origin, "/api/notes", { cookie: reader })).json(), { notes: [] });
  assert.equal((await request(origin, photoPath, { cookie: reader })).status, 404);

  assert.ok((await request(origin, "/api/logout", {
    method: "POST", cookie: reader, json: {},
  })).ok);
  assert.equal((await request(origin, "/api/notes", { cookie: reader })).status, 401);

  await server.stop();
  server = await startServer(dataDir);
  ({ origin } = server);
  const authorAfterRestart = await login(origin, authorPassword, "author");
  const persisted = await request(origin, "/api/notes", { cookie: authorAfterRestart });
  const [persistedNote] = (await persisted.json()).notes;
  assert.equal(persistedNote.id, note.id);
  assert.equal(persistedNote.status, "draft");
  assert.equal(persistedNote.body, draft.body);
  assert.equal((await request(origin, photoPath, { cookie: authorAfterRestart })).status, 200);
});
