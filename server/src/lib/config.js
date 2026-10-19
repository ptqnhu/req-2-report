// All runtime settings in one place. Every value can be overridden with an environment variable.
const num = (v, fallback) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : fallback);

export const settings = {
  port: num(process.env.PORT, 4000),
  /** Close database connections nobody has used for this long. */
  idleMs: num(process.env.CONNECTION_IDLE_MINUTES, 30) * 60_000,
  maxConnections: num(process.env.MAX_CONNECTIONS, 50),
  /** Rows returned for the on-screen preview. The exported report still returns every row. */
  previewRowLimit: num(process.env.PREVIEW_ROW_LIMIT, 200),
  /**
   * Charts sum up every row the query returns, so they aren't held to the preview's limit; this is only a safety
   * ceiling so a detail query that returns millions of rows can't swamp the browser.
   */
  chartRowLimit: num(process.env.CHART_ROW_LIMIT, 100_000),
  queryTimeoutMs: num(process.env.QUERY_TIMEOUT_SECONDS, 60) * 1000,
  /** Ad hoc exports (CSV, Excel) run the whole query; they stop at this many rows (Excel's own limit is 1,048,575). */
  exportRowLimit: Math.min(num(process.env.EXPORT_ROW_LIMIT, 500_000), 1_048_575),
  /** PDFs are for reading and printing, so they stop sooner (20,000 rows is about 600 pages). */
  pdfRowLimit: num(process.env.PDF_ROW_LIMIT, 20_000),
  exportTimeoutMs: num(process.env.EXPORT_TIMEOUT_SECONDS, 300) * 1000,
  /** Optional allow-list of SQL Server host names, e.g. "sqlprod01,sqlrep02". Empty = any. */
  /** ODBC driver used for "This computer" (Windows) sign-in to a local SQL Server. */
  odbcDriver: process.env.ODBC_DRIVER || "ODBC Driver 18 for SQL Server",
  /**
   * AI query assistant. Backend "cli" runs the Claude Code CLI headless with its signed-in account;
   * "api" calls the Claude API with ANTHROPIC_API_KEY. Then model, effort, time limit (CLI) and how much schema it may be sent.
   */
  aiBackend: (process.env.AI_BACKEND || "cli").trim().toLowerCase(),
  aiModel: process.env.AI_MODEL || "claude-opus-5-5",
  aiEffort: process.env.AI_EFFORT || "high",
  aiTimeoutMs: num(process.env.AI_TIMEOUT_SECONDS, 180) * 1000,
  aiSchemaMaxChars: num(process.env.AI_SCHEMA_MAX_CHARS, 1_500_000),
  allowedServers: (process.env.ALLOWED_SERVERS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  /** The database every page opens by itself, without the connect form (null when DB_SERVER isn't set). */
  defaultConnection: defaultConnection(process.env),
};

/**
 * DB_SERVER, DB_DATABASE, DB_AUTH ("sql", "windows" or "local"), DB_USER, DB_PASSWORD, DB_ENCRYPT and
 * DB_TRUST_SERVER_CERTIFICATE, in the shape the connect form sends.
 */
export function defaultConnection(env) {
  const v = (name) => env["DB_" + name];
  if (!v("SERVER")?.trim()) return null;
  const yes = (s, fallback) => (s === undefined || s === "" ? fallback : /^(1|true|yes)$/i.test(s.trim()));
  return {
    server: v("SERVER").trim(),
    database: v("DATABASE") || "",
    authType: (v("AUTH") || "sql").trim().toLowerCase(),
    user: v("USER") || "",
    password: v("PASSWORD") || "",
    encrypt: yes(v("ENCRYPT"), true),
    trustServerCertificate: yes(v("TRUST_SERVER_CERTIFICATE"), /^(localhost|127\.0\.0\.1|\.|\(local\))([\\,]|$)/i.test(v("SERVER").trim())),
  };
}
