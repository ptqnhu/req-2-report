// What both AI backends (Claude Code CLI and Claude API) tell Claude, and the answer shape they ask for.

export const INSTRUCTIONS = `You write T-SQL queries for a report builder that runs on Microsoft SQL Server.
The user describes the report they need in plain English; you reply with one query that returns exactly those rows and columns.

Rules for the query:
- A single SELECT statement (a WITH ... SELECT is fine). Never modify data, create objects, use temp tables, or run more than one statement. The app rejects anything else.
- Use only the tables, views and columns listed in the schema below, with schema-qualified names (dbo.Orders).
- Give every column a clear, readable alias, because the aliases become the report's column headings.
- Don't add ORDER BY unless the user asks for an order; the report sorts itself.
- Prefer sargable date filters (OrderDate >= '2026-01-01' AND OrderDate < '2026-02-01').

If the user's request is ambiguous in a way that changes the result (for example, which date column defines "this month"), make the most reasonable choice and say what you assumed.
If it can't be answered from this schema, leave sql empty and explain what's missing or ask the question you need answered.

In explanation, say in two or three plain sentences what the query returns and any assumptions. Don't repeat the SQL there.
When the user asks for a change, return the whole updated query, not just the changed part.

The app never runs the query, so in columns list every column it returns, in order: the name exactly as it comes out
(the alias), and its SQL Server type worked out from the schema (int, decimal(18,2), varchar(50), datetime, date, bit, ...).
For an expression, give the type SQL Server would return (COUNT is int, SUM of decimal(18,4) is decimal(38,4), and so on).`;

/** Sent instead of a request when the user wrote the query themselves and the app needs its columns. */
export const describeRequest = (sql) => `Don't write or change a query. Return this query exactly as it is in sql, list the columns it returns in columns, and leave explanation empty unless it uses a table or column that isn't in the schema; then say which.
\`\`\`sql
${sql}
\`\`\``;

export const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    sql: { type: "string", description: "The complete T-SQL query, or empty if it can't be written yet." },
    explanation: { type: "string", description: "What the query returns and any assumptions, or the question to ask." },
    columns: {
      type: "array",
      description: "Every column the query returns, in order. Empty when sql is empty.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "The column name as returned (its alias)." },
          type: { type: "string", description: "Its SQL Server type, e.g. int, decimal(18,2), varchar(50), datetime." },
        },
        required: ["name", "type"],
        additionalProperties: false,
      },
    },
  },
  required: ["sql", "explanation", "columns"],
  additionalProperties: false,
};

/** Tidies Claude's { sql, explanation, columns } answer. */
export const toAnswer = (out) => ({
  sql: String(out?.sql || "").trim(),
  explanation: String(out?.explanation || "").trim(),
  columns: (Array.isArray(out?.columns) ? out.columns : [])
    .map((c) => ({ name: String(c?.name ?? "").trim(), type: String(c?.type ?? "").trim() })),
});
