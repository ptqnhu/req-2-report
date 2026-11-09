// Report queries must only read data: one SELECT, optionally after SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED.
// This check runs before anything reaches SQL Server;
// previews also run inside a transaction that is always rolled back (see db/preview.js).
// For real protection, connect with a login that only has read access (e.g. db_datareader).
import { mask } from "./sqlMask.js";

// T-SQL needs no ";" between statements, so any keyword that starts a write or ends the preview's transaction is blocked.
const BLOCKED = /\b(insert|update|delete|merge|drop|alter|create|truncate|exec|execute|grant|revoke|deny|backup|restore|shutdown|dbcc|bulk|openrowset|opendatasource|openquery|into|waitfor|use|kill|reconfigure|begin|commit|rollback|save|enable|disable|writetext|updatetext|checkpoint|setuser|revert|sp_\w+|xp_\w+)\b/i;
const NEXT_VALUE = /\bnext\s+value\s+for\b/i; // advances a sequence, which a rollback doesn't undo
const READ_UNCOMMITTED = /^[\s;]*set\s+transaction\s+isolation\s+level\s+read\s+uncommitted\b\s*;?/i;

/** The one statement allowed before the SELECT, written the same way every time. */
export const ISOLATION = "SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;";

/**
 * Splits off a leading SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED, so the rest can be checked or wrapped
 * as a plain SELECT. isolation is ISOLATION when the query had it, otherwise "".
 */
export function splitIsolation(sql) {
  const text = String(sql ?? "");
  const m = mask(text).match(READ_UNCOMMITTED);
  return m ? { isolation: ISOLATION, rest: text.slice(m[0].length) } : { isolation: "", rest: text };
}

/** Returns a message explaining why the query isn't allowed, or "" if it's fine. */
export function checkReadOnly(sql) {
  // Comments, string literals and quoted names can contain anything, so they're blanked in one pass first.
  const stripped = mask(splitIsolation(sql).rest).trim().replace(/^;+\s*/, ""); // allow the common ";WITH cte AS (...)" style

  if (!stripped) return "Enter a query.";
  if (!/^(select|with)\b/i.test(stripped)) return "Only SELECT queries can be used for reports. Start the query with SELECT or WITH.";
  const body = stripped.replace(/;\s*$/, "");
  if (body.includes(";")) return "Use a single SELECT statement. Remove the extra statement after the semicolon.";
  const m = body.match(BLOCKED);
  if (m) return `The query can't contain ${m[1].toUpperCase()}. Reports can only read data.`;
  if (NEXT_VALUE.test(body)) return "The query can't contain NEXT VALUE FOR. Reports can only read data.";
  return "";
}
