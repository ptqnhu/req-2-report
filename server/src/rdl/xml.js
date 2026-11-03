import { randomUUID } from "node:crypto";

export const xesc = (s) => String(s ?? "")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "") // not allowed in XML; SSRS rejects the file
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const vbStr = (s) => `"${String(s).replace(/"/g, '""')}"`;
/** Static text that starts with "=" would be read as an expression, so wrap it. */
export const lit = (s) => (String(s).startsWith("=") ? "=" + vbStr(s) : String(s));
export const inch = (n) => `${(+n).toFixed(3).replace(/\.?0+$/, "")}in`;
export const guid = () => randomUUID();

/** Makes a unique, CLS-compliant RDL name (fields, report items, parameters). */
export function rdlIdent(s, used) {
  let n = String(s).replace(/[^A-Za-z0-9_]/g, "_").replace(/_+/g, "_");
  if (!/^[A-Za-z]/.test(n)) n = "F_" + n;
  n = n.slice(0, 60);
  let out = n, i = 2;
  while (used.has(out.toLowerCase())) out = `${n}_${i++}`;
  used.add(out.toLowerCase());
  return out;
}
