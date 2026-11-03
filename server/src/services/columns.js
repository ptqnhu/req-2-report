import { randomUUID } from "node:crypto";
import { HttpError } from "../lib/errors.js";
import { fromSqlServerType } from "./typeInference.js";

export const newKey = () => "c" + randomUUID().slice(0, 8);

/**
 * The report's columns from the AI's list of what the query returns ([{ name, type }], type a SQL Server type).
 * Unnamed columns get ColumnN and repeated names a _2 suffix, as SSRS needs unique field names.
 */
export function toColumns(list) {
  if (!list.length) throw new HttpError(422, "The AI assistant couldn't tell which columns the query returns. Check the query, or ask the AI to write it.");
  const seen = {};
  return list.map((c, i) => {
    const unnamed = !c.name;
    const base = c.name || `Column${i + 1}`;
    const k = base.toLowerCase();
    seen[k] = (seen[k] || 0) + 1;
    const name = seen[k] > 1 ? `${base}_${seen[k]}` : base;
    const [type, reason] = fromSqlServerType(c.type, name);
    return { key: newKey(), name, sqlType: c.type, type, suggested: type, reason, selected: true, unnamed, dup: seen[k] > 1 };
  });
}
