#!/usr/bin/env node

import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, dirname, join, parse, resolve } from "node:path";

const HEADER = "ts\tphase\tdecision\twhy\tevidence\tresult\n";
const MAX_CELL_BYTES = 64 * 1024;
const MAX_LOG_BYTES = 64 * 1024 * 1024;
const UNSAFE_TEXT =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]+/g;
const CREDENTIAL_LIKE_TEXT = [
  /\b(?:https?|ssh|git):\/\/[^/\s@]+@/iu,
  /[?&](?:access[_-]?token|api[_-]?key|key|token|secret|password|passwd|signature|sig|credential|authorization|auth)=/iu,
  /(?:^|[\s;,])authorization\s*:/iu,
  /(?:^|[\s;,])bearer\s+\S/iu,
  /(?:^|[\s;,])(?:access[_-]?token|api[_-]?key|token|secret|password|passwd|signature|credential)\s*[:=]\s*\S/iu,
];
const OPEN_APPEND =
  constants.O_RDWR |
  constants.O_APPEND |
  constants.O_NOFOLLOW |
  constants.O_CLOEXEC;

function usage() {
  process.stderr.write(
    "usage: log.sh <logfile> <phase> <decision> <why> <evidence> <result>\n"
  );
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(UNSAFE_TEXT, " ").replace(/\s+/g, " ").trim();
}

function assertOwnedDirectory(path) {
  const metadata = lstatSync(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`log parent is not a real directory: ${path}`);
  }
  if (metadata.uid !== process.getuid()) {
    throw new Error(`log parent is not owned by the current user: ${path}`);
  }
  if ((metadata.mode & 0o022) !== 0) {
    throw new Error(`log parent is group- or world-writable: ${path}`);
  }
}

function rejectUntrustedSymlinkComponents(path) {
  const parsed = parse(path);
  let cursor = parsed.root;
  for (const component of path.slice(parsed.root.length).split("/").filter(Boolean)) {
    cursor = join(cursor, component);
    if (!existsSync(cursor)) return;
    const metadata = lstatSync(cursor);
    if (metadata.isSymbolicLink() && metadata.uid !== 0) {
      throw new Error(`refusing user-controlled symbolic-link log parent: ${cursor}`);
    }
  }
}

function ensureSafeParent(path) {
  rejectUntrustedSymlinkComponents(path);
  const missing = [];
  let cursor = path;
  while (!existsSync(cursor)) {
    missing.push(cursor);
    const parent = dirname(cursor);
    if (parent === cursor) {
      throw new Error(`cannot find an existing ancestor for log parent: ${path}`);
    }
    cursor = parent;
  }

  const existing = lstatSync(cursor);
  if (!existing.isDirectory() || existing.isSymbolicLink()) {
    throw new Error(`log parent ancestor is not a real directory: ${cursor}`);
  }
  cursor = realpathSync(cursor);

  for (const directory of missing.reverse()) {
    const canonicalDirectory = join(cursor, basename(directory));
    try {
      mkdirSync(canonicalDirectory, { mode: 0o700 });
    } catch (error) {
      if (!(error && typeof error === "object" && error.code === "EEXIST")) {
        throw error;
      }
    }
    const metadata = lstatSync(canonicalDirectory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error(`refusing symbolic-link log parent: ${canonicalDirectory}`);
    }
    if (metadata.uid !== process.getuid()) {
      throw new Error(`new log parent is not owned by the current user: ${canonicalDirectory}`);
    }
    chmodSync(canonicalDirectory, 0o700);
    cursor = canonicalDirectory;
  }

  const canonical = realpathSync(cursor);
  assertOwnedDirectory(canonical);
  return canonical;
}

function cleanCell(value) {
  if (Buffer.byteLength(value) > MAX_CELL_BYTES) {
    throw new Error(`decision-log cell exceeds ${MAX_CELL_BYTES} bytes`);
  }
  const clean = value.replace(UNSAFE_TEXT, " ");
  if (CREDENTIAL_LIKE_TEXT.some((pattern) => pattern.test(clean))) {
    throw new Error("decision-log row contains credential-like data");
  }
  return /^[=+\-@]/.test(clean) ? `'${clean}` : clean;
}

function publishHeader(path) {
  if (existsSync(path)) return;
  const temporary = join(
    dirname(path),
    `.spudex-log-init-${process.pid}-${randomBytes(12).toString("hex")}`
  );
  let descriptor;
  try {
    descriptor = openSync(
      temporary,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW |
        constants.O_CLOEXEC,
      0o600
    );
    const header = Buffer.from(HEADER, "utf8");
    const written = writeSync(descriptor, header, 0, header.length, null);
    if (written !== header.length) {
      throw new Error(`short decision-log header write: ${written}/${header.length} bytes`);
    }
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    try {
      linkSync(temporary, path);
    } catch (error) {
      if (!(error && typeof error === "object" && error.code === "EEXIST")) {
        throw error;
      }
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try {
      unlinkSync(temporary);
    } catch (error) {
      if (!(error && typeof error === "object" && error.code === "ENOENT")) {
        throw error;
      }
    }
  }
}

function openLog(path) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const descriptor = openSync(path, OPEN_APPEND);
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile()) {
      closeSync(descriptor);
      throw new Error(`decision log is not a regular file: ${path}`);
    }
    if (metadata.uid !== process.getuid()) {
      closeSync(descriptor);
      throw new Error(`decision log is not owned by the current user: ${path}`);
    }
    if (metadata.nlink !== 1) {
      closeSync(descriptor);
      if (recoverInitializationLink(path, metadata)) continue;
      throw new Error(`decision log has unexpected hard links: ${path}`);
    }
    if (metadata.size === 0) {
      closeSync(descriptor);
      throw new Error(`refusing pre-existing empty decision log: ${path}`);
    }
    return descriptor;
  }
  throw new Error(`could not recover decision-log initialization: ${path}`);
}

function readRegularFile(path, maxBytes) {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = fstatSync(descriptor);
    if (
      !metadata.isFile() ||
      metadata.uid !== process.getuid() ||
      metadata.size > maxBytes
    ) {
      throw new Error(`unsafe decision-log file: ${path}`);
    }
    const value = readFileSync(descriptor);
    if (value.length > maxBytes) {
      throw new Error(`decision log exceeds ${maxBytes} bytes: ${path}`);
    }
    return value;
  } finally {
    closeSync(descriptor);
  }
}

function recoverInitializationLink(path, metadata) {
  const prefix = /^\.spudex-log-init-[1-9][0-9]*-[0-9a-f]{24}$/;
  let recovered = false;
  for (const name of readdirSync(dirname(path))) {
    if (!prefix.test(name)) continue;
    const candidate = join(dirname(path), name);
    const candidateMetadata = lstatSync(candidate);
    if (
      candidateMetadata.isSymbolicLink() ||
      !candidateMetadata.isFile() ||
      candidateMetadata.uid !== process.getuid() ||
      candidateMetadata.dev !== metadata.dev ||
      candidateMetadata.ino !== metadata.ino
    ) {
      continue;
    }
    if (readRegularFile(candidate, Buffer.byteLength(HEADER)).toString("utf8") !== HEADER) {
      continue;
    }
    unlinkSync(candidate);
    recovered = true;
  }
  return recovered;
}

function validateExistingLog(descriptor, path, payloadBytes) {
  const metadata = fstatSync(descriptor);
  if (metadata.size > MAX_LOG_BYTES - payloadBytes) {
    throw new Error(`decision log cannot exceed ${MAX_LOG_BYTES} bytes: ${path}`);
  }
  const bytes = readFileSync(descriptor);
  if (bytes.length > MAX_LOG_BYTES - payloadBytes) {
    throw new Error(`decision log cannot exceed ${MAX_LOG_BYTES} bytes: ${path}`);
  }
  let body;
  try {
    body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`decision log is not valid UTF-8: ${path}`);
  }
  if (!body.endsWith("\n")) {
    throw new Error(`decision log does not end with a complete row: ${path}`);
  }
  const lines = body.slice(0, -1).split("\n");
  if (lines[0] !== HEADER.slice(0, -1)) {
    throw new Error(`decision log has the wrong TSV header: ${path}`);
  }
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  for (const line of lines.slice(1)) {
    const cells = line.split("\t");
    if (
      cells.length !== 6 ||
      !timestamp.test(cells[0]) ||
      cells.slice(1).some((cell) => /^[=+\-@]/.test(cell)) ||
      cells.some((cell) =>
        /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/.test(cell)
      )
    ) {
      throw new Error(`decision log contains a malformed TSV row: ${path}`);
    }
  }
}

function assertAppendFits(descriptor, path, payloadBytes) {
  if (fstatSync(descriptor).size > MAX_LOG_BYTES - payloadBytes) {
    throw new Error(`decision log cannot exceed ${MAX_LOG_BYTES} bytes: ${path}`);
  }
}

function appendRow(path, values) {
  const requestedParent = resolve(dirname(path));
  const parent = ensureSafeParent(requestedParent);
  const canonicalPath = join(parent, basename(path));

  if (existsSync(canonicalPath)) {
    const metadata = lstatSync(canonicalPath);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error(`decision log is not a real regular file: ${canonicalPath}`);
    }
  }

  publishHeader(canonicalPath);
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const row = `${timestamp}\t${values.map(cleanCell).join("\t")}\n`;
  const payload = Buffer.from(row, "utf8");
  const descriptor = openLog(canonicalPath);
  try {
    validateExistingLog(descriptor, canonicalPath, payload.length);
    fchmodSync(descriptor, 0o600);
    if ((fstatSync(descriptor).mode & 0o777) !== 0o600) {
      throw new Error(`could not restrict decision log permissions: ${canonicalPath}`);
    }
    assertAppendFits(descriptor, canonicalPath, payload.length);
    const written = writeSync(descriptor, payload, 0, payload.length, null);
    if (written !== payload.length) {
      throw new Error(`short append to decision log: ${written}/${payload.length} bytes`);
    }
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

if (process.argv.length !== 8) {
  usage();
  process.exit(1);
}

const logfile = resolve(process.argv[2]);
try {
  appendRow(logfile, process.argv.slice(3));
} catch (error) {
  process.stderr.write(`log.sh: ${safeError(error)}\n`);
  process.exit(1);
}
