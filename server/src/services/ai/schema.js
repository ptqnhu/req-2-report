import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HttpError } from "../../lib/errors.js";

/** Saved schema descriptions, one `<database>.txt` per database. The app never connects to a database. */
export const SCHEMA_DIR = fileURLToPath(new URL("../../../schemas/", import.meta.url));

/** A schema file's text without its `#` comment lines; "" for a template that has nothing else. */
const contentOf = (raw) => raw.split(/\r?\n/).filter((l) => !l.startsWith("#")).join("\n").trim();
const tableCount = (text) => text.split("\n").filter((l) => / \((table|view)\): /.test(l)).length;

/** The databases that have a filled-in schema file: [{ name, tables }], by name. */
export async function listSchemas(dir = SCHEMA_DIR) {
  let files;
  try { files = await readdir(dir); } catch { return []; }
  const out = [];
  for (const f of files.filter((f) => f.toLowerCase().endsWith(".txt"))) {
    const text = contentOf(await readFile(join(dir, f), "utf8"));
    if (text) out.push({ name: f.slice(0, -4), tables: tableCount(text) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The saved schema file for this database, or null if there isn't one (or it only has `#` comment lines, like a template).
 * Matched against the folder listing (ignoring case) so a database name is never used as a path.
 */
export async function readSchemaFile(database, dir = SCHEMA_DIR) {
  if (!database) return null;
  let files;
  try { files = await readdir(dir); } catch { return null; }
  const want = `${database}.txt`.toLowerCase();
  const file = files.find((f) => f.toLowerCase() === want);
  if (!file) return null;
  return contentOf(await readFile(join(dir, file), "utf8")) || null;
}

/** Describes the database's tables, views, columns and foreign keys as plain text for the AI, from its schema file. */
export async function loadSchema(database, { maxChars, dir } = {}) {
  const text = await readSchemaFile(database, dir);
  if (!text) throw new HttpError(404, `There's no schema for ${database}. Add it to server/schemas/${database}.txt.`);
  if (text.length > maxChars) {
    throw new HttpError(413, `The ${database} schema has too many tables (${tableCount(text)}) to describe to the AI assistant. Raise AI_SCHEMA_MAX_CHARS to allow it.`);
  }
  return text;
}
