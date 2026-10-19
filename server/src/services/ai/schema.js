import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HttpError } from "../../lib/errors.js";
import { sqlErrorMessage } from "../db/errors.js";

const COLUMNS_SQL = `
SELECT s.name AS sch, o.name AS obj, o.type AS kind, c.name AS col, TYPE_NAME(c.user_type_id) AS type
FROM sys.objects o
JOIN sys.schemas s ON s.schema_id = o.schema_id
JOIN sys.columns c ON c.object_id = o.object_id
WHERE o.type IN ('U', 'V') AND o.is_ms_shipped = 0
ORDER BY s.name, o.name, c.column_id`;

const KEYS_SQL = `
SELECT OBJECT_SCHEMA_NAME(k.parent_object_id) + '.' + OBJECT_NAME(k.parent_object_id) AS fromTable, pc.name AS fromCol,
       OBJECT_SCHEMA_NAME(k.referenced_object_id) + '.' + OBJECT_NAME(k.referenced_object_id) AS toTable, rc.name AS toCol
FROM sys.foreign_key_columns k
JOIN sys.columns pc ON pc.object_id = k.parent_object_id AND pc.column_id = k.parent_column_id
JOIN sys.columns rc ON rc.object_id = k.referenced_object_id AND rc.column_id = k.referenced_column_id
ORDER BY fromTable, toTable`;

/** Saved schema descriptions, one `<database>.txt` per database, read instead of querying the database. */
export const SCHEMA_DIR = fileURLToPath(new URL("../../../schemas/", import.meta.url));

/** One schema text per connection pool, so follow-up questions reuse it (and hit the AI's prompt cache). */
const cache = new WeakMap();

/** Reads the database's tables, views, columns and foreign keys from SQL Server as plain text. */
export async function querySchema(pool) {
  let cols, keys;
  try {
    cols = (await pool.request().query(COLUMNS_SQL)).recordset || [];
    keys = (await pool.request().query(KEYS_SQL)).recordset || [];
  } catch (e) {
    throw new HttpError(422, sqlErrorMessage(e));
  }
  if (!cols.length) throw new HttpError(422, "This login can't see any tables or views in the database.");

  const objects = new Map();
  for (const r of cols) {
    const name = `${r.sch}.${r.obj}`;
    if (!objects.has(name)) objects.set(name, { kind: r.kind.trim() === "V" ? "view" : "table", cols: [] });
    objects.get(name).cols.push(`${r.col} ${r.type}`);
  }
  const lines = [...objects].map(([name, o]) => `${name} (${o.kind}): ${o.cols.join(", ")}`);
  if (keys.length) lines.push("", "Foreign keys:", ...keys.map((k) => `${k.fromTable}.${k.fromCol} -> ${k.toTable}.${k.toCol}`));
  return { text: lines.join("\n"), tables: objects.size };
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
  const text = (await readFile(join(dir, file), "utf8")).split(/\r?\n/).filter((l) => !l.startsWith("#")).join("\n").trim();
  return text || null;
}

/**
 * Describes the database's tables, views, columns and foreign keys as plain text for the AI.
 * Uses the saved schema file for `database` when there is one (source "file"); otherwise asks SQL Server (source "database").
 * Only names and types are read; no row data leaves the database.
 * @returns {Promise<{text: string, source: "file"|"database"}>}
 */
export async function loadSchema(pool, { maxChars, database, dir } = {}) {
  if (cache.has(pool)) return cache.get(pool);
  const saved = await readSchemaFile(database, dir);
  const { text, tables } = saved ? { text: saved, tables: saved.split("\n").filter((l) => / \((table|view)\): /.test(l)).length } : await querySchema(pool);
  if (text.length > maxChars) {
    throw new HttpError(413, `The database has too many tables (${tables}) to describe to the AI assistant. Raise AI_SCHEMA_MAX_CHARS to allow it.`);
  }
  const schema = { text, source: saved ? "file" : "database" };
  cache.set(pool, schema);
  return schema;
}
