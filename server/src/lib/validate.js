import { TYPES, DEFAULT_TPL, DEFAULT_EXPORT, DATE_FORMATS, cleanLook, cleanTypes } from "@req-2-report/shared";
import { HttpError } from "./errors.js";

export function requireString(v, name, { max = 200_000, allowEmpty = true } = {}) {
  if (typeof v !== "string") throw new HttpError(400, `${name} must be text.`);
  if (!allowEmpty && !v.trim()) throw new HttpError(400, `${name} is required.`);
  if (v.length > max) throw new HttpError(413, `${name} is too long.`);
  return v;
}

export function optionalString(v, name, max = 2000) {
  if (v === undefined || v === null) return "";
  return requireString(v, name, { max });
}

/** Keeps only the column fields the server relies on and checks their types. */
export function normalizeColumns(cols) {
  if (!Array.isArray(cols)) throw new HttpError(400, "columns must be a list.");
  if (cols.length > 500) throw new HttpError(413, "Too many columns.");
  return cols.map((c, i) => {
    if (!c || typeof c.key !== "string" || typeof c.name !== "string") throw new HttpError(400, `Column ${i + 1} needs a key and a name.`);
    if (!TYPES.includes(c.type)) throw new HttpError(400, `Column “${c.name}” has an unknown type.`);
    return {
      key: c.key, name: c.name, type: c.type, selected: c.selected !== false,
      unnamed: !!c.unnamed, dup: !!c.dup,
    };
  });
}

/** Merges a client template onto the defaults, dropping unknown keys. */
export function sanitizeTemplate(tpl = {}) {
  const out = { ...DEFAULT_TPL };
  for (const k of Object.keys(DEFAULT_TPL)) if (tpl && tpl[k] !== undefined) out[k] = tpl[k];
  out.name = String(out.name || "").slice(0, 80);
  out.order = Array.isArray(out.order) ? out.order.map(String) : [];
  out.cols = out.cols && typeof out.cols === "object" ? out.cols : {};
  out.decimals = Math.min(4, Math.max(0, Number(out.decimals) || 0));
  out.logo = !!out.logo;
  if (!DATE_FORMATS.includes(out.dateFormat)) out.dateFormat = DEFAULT_TPL.dateFormat;
  out.look = cleanLook(out.look);
  out.types = cleanTypes(out.types);
  return out;
}

export function sanitizeExport(exp = {}) {
  const out = { ...DEFAULT_EXPORT };
  for (const k of Object.keys(DEFAULT_EXPORT)) if (exp && typeof exp[k] === "string") out[k] = exp[k];
  return out;
}
