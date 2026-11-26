/**
 * Where the report runs. A database can have a different name in each environment: production and sandbox read the
 * replicated copy of APM (Repl_APM), QA reads APM itself. A database not listed here has the same name everywhere.
 */
export const ENVIRONMENTS = [["production", "Production"], ["sandbox", "Sandbox"], ["qa", "QA"]];
export const DEFAULT_ENVIRONMENT = "production";

const NAMES = {
  apm: { production: "Repl_APM", sandbox: "Repl_APM", qa: "APM" },
};

/** The name to write in queries and connect to for `database` (a schema file's name) in `environment`. */
export const databaseName = (database, environment) =>
  NAMES[String(database || "").toLowerCase()]?.[environment] || database;
