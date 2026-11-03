import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Business meaning the schema doesn't show (glossary, joins, gotchas, table notes), written by analysts. */
export const KNOWLEDGE_DIR = fileURLToPath(new URL("../../../../knowledge/", import.meta.url));

// golden/ is left out on purpose: those verified queries test the assistant, so it mustn't see them.
const SHARED_FILES = ["glossary.yaml", "joins.yaml", "gotchas.md"];

/** A file's text, without whole-line `#` comments in YAML (Markdown `#` lines are headings); "" if it's missing. */
async function readText(file) {
  let raw;
  try { raw = await readFile(file, "utf8"); } catch { return ""; }
  const lines = raw.replace(/^﻿/, "").split(/\r?\n/);
  return (file.endsWith(".md") ? lines : lines.filter((l) => !/^\s*#/.test(l))).join("\n").trim();
}

/** A folder's entries, or [] if it's missing. */
const list = (dir) => readdir(dir).catch(() => []);

/**
 * The knowledge base for this database as plain text for the AI, one `### <path>` section per file:
 * the shared files, then tables/<database>/*.yaml (the folder matched ignoring case). "" when there's none.
 */
export async function loadKnowledge(database, dir = KNOWLEDGE_DIR) {
  const files = [...SHARED_FILES];
  const want = String(database || "").toLowerCase();
  const tablesDir = (await list(join(dir, "tables"))).find((d) => d.toLowerCase() === want);
  if (tablesDir) {
    const tables = (await list(join(dir, "tables", tablesDir))).filter((f) => /\.ya?ml$/i.test(f)).sort();
    files.push(...tables.map((f) => `tables/${tablesDir}/${f}`));
  }
  const sections = [];
  for (const f of files) {
    const text = await readText(join(dir, f));
    if (text) sections.push(`### ${f}\n${text}`);
  }
  return sections.join("\n\n");
}
