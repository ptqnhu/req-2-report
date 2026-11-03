export const TYPES = ["Text", "Integer", "Decimal", "Currency", "Percentage", "Date", "DateTime", "Boolean"];
export const NUMERIC = new Set(["Integer", "Decimal", "Currency", "Percentage"]);

/** Groups types into the four families that share formatting and filter rules. */
export const family = (t) =>
  NUMERIC.has(t) ? "Number" : t === "Date" || t === "DateTime" ? "Date" : t === "Boolean" ? "Boolean" : "Text";

export const OPS = {
  Text: [["contains", "contains"], ["notcontains", "does not contain"], ["equals", "is"], ["starts", "starts with"], ["empty", "is empty"], ["notempty", "is not empty"]],
  Number: [["eq", "="], ["neq", "≠"], ["gt", ">"], ["gte", "≥"], ["lt", "<"], ["lte", "≤"], ["between", "between"], ["empty", "is empty"], ["notempty", "is not empty"]],
  Date: [["on", "is on"], ["before", "is before"], ["after", "is after"], ["between", "is between"], ["empty", "is empty"], ["notempty", "is not empty"]],
  Boolean: [["true", "is yes"], ["false", "is no"], ["empty", "is empty"]],
};
export const NO_VALUE_OPS = new Set(["empty", "notempty", "true", "false"]);

/**
 * Date formats on offer. Kept to the US format for internal reports; dates.js can still write the older ones, so a
 * report or template saved with one keeps working until it's next opened (templateStyle and the server switch it).
 */
export const DATE_FORMATS = ["MM/DD/YYYY"];

/** New reports start in the LoanMart style: green header band with the logo, across the full width of the report. */
export const DEFAULT_TPL = {
  name: "",
  theme: "loanmart",
  density: "normal",
  zebra: true,
  rowNumbers: false,
  totals: true,
  layout: "expand",
  stickyFirst: true,
  org: "", // shown above the title when set (Template step: Organisation)
  logo: true, // LoanMart style: show the logo in the header band
  footer: "",
  currency: "$",
  decimals: 2,
  dateFormat: "MM/DD/YYYY",
  order: [],
  cols: {},
  look: {}, // changes to parts of the report: colours, text sizes, bold (shared/look.js)
  types: {}, // changes per data type: alignment, colour, bold, display format (shared/look.js)
};

/**
 * The report-wide settings a saved template carries: layout, look, header and footer, formats.
 * Not `order` or `cols`, which belong to one query's columns.
 */
export const STYLE_KEYS = Object.keys(DEFAULT_TPL).filter((k) => !["name", "order", "cols"].includes(k));

/** A template's report-wide settings, with defaults for any it doesn't have (or a date format no longer offered). */
export const templateStyle = (tpl) => {
  const out = Object.fromEntries(STYLE_KEYS.map((k) => [k, tpl?.[k] ?? DEFAULT_TPL[k]]));
  if (!DATE_FORMATS.includes(out.dateFormat)) out.dateFormat = DEFAULT_TPL.dateFormat;
  return out;
};

export const DEFAULT_EXPORT = {
  dsMode: "shared", // "shared" data source on the report server (set up there, with its credentials) or an "embedded" connection string
  dsRef: "",
  server: "",
  database: "",
  dsAuth: "windows", // "windows" (readers' own login) or "sql" (stored SQL login, set on the server)
  filterMode: "fixed",
  orientation: "landscape",
  schema: "2016",
};
