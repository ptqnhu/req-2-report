import { tokens } from "@req-2-report/shared";

/** Guesses a type from a column name. Returns [type, reason] or null. Rule order matters. */
export function nameType(name) {
  const t = tokens(name);
  if (!t.length) return null;
  const last = t[t.length - 1];
  const has = (...w) => w.some((x) => t.includes(x));
  if (["is", "has", "can", "should", "was"].includes(t[0]) || last === "flag") return ["Boolean", "Name reads as yes or no"];
  if (["at", "timestamp", "datetime", "time", "ts"].includes(last)) return ["DateTime", "Name suggests a timestamp"];
  if (has("date", "dob", "birthday", "birthdate") || last === "day" || last === "on") return ["Date", "Name suggests a date"];
  if (["id", "count", "qty", "quantity", "number", "num", "no", "units", "age", "year", "rank"].includes(last)) return ["Integer", "Name suggests a whole number"];
  if (has("rate", "ratio", "pct", "percent", "percentage", "discount", "margin", "share", "conversion", "churn", "growth"))
    return ["Percentage", "Name suggests a rate or percentage"];
  if (has("price", "amount", "revenue", "cost", "sales", "salary", "fee", "fees", "balance", "budget", "profit", "spend",
          "income", "total", "payment", "tax", "subtotal", "wage"))
    return ["Currency", "Name suggests money"];
  return null;
}

const INTEGER = new Set(["tinyint", "smallint", "int", "bigint"]);
const DECIMAL = new Set(["decimal", "numeric", "float", "real"]);
const DATETIME = new Set(["datetime", "datetime2", "smalldatetime", "datetimeoffset"]);

/**
 * Maps a SQL Server type (as reported by sp_describe_first_result_set, e.g. "decimal(10,2)")
 * to one of the app's types. The SQL type decides the family; for plain decimals the column
 * name can refine it to Currency or Percentage. Returns [type, reason].
 */
export function fromSqlServerType(systemTypeName, name) {
  const full = String(systemTypeName || "").toLowerCase().trim();
  const base = full.replace(/\(.*$/, "").trim();
  const reason = `SQL type is ${full || "unknown"}`;
  if (base === "bit") return ["Boolean", reason];
  if (INTEGER.has(base)) return ["Integer", reason];
  if (base === "money" || base === "smallmoney") return ["Currency", reason];
  if (DECIMAL.has(base)) {
    const nt = nameType(name);
    if (nt && (nt[0] === "Currency" || nt[0] === "Percentage")) return [nt[0], `${reason}, and the name suggests ${nt[0] === "Currency" ? "money" : "a percentage"}`];
    return ["Decimal", reason];
  }
  if (base === "date") return ["Date", reason];
  if (DATETIME.has(base)) return ["DateTime", reason];
  return ["Text", reason];
}
