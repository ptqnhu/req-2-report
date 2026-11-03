import { Router } from "express";
import { asyncHandler, HttpError } from "../lib/errors.js";
import { requireString, optionalString } from "../lib/validate.js";
import { settings } from "../lib/config.js";
import { listSchemas, loadSchema } from "../services/ai/schema.js";
import { loadKnowledge } from "../services/ai/knowledge.js";
import { writeQuery } from "../services/ai/queryWriter.js";
import { describeRequest } from "../services/ai/prompt.js";
import { checkReadOnly } from "../services/queryGuard.js";
import { toColumns } from "../services/columns.js";
import { firstTableName } from "../services/sqlParser.js";

/** Checks the conversation: alternating turns, starting and ending with the user. */
function readMessages(list) {
  if (!Array.isArray(list) || !list.length) throw new HttpError(400, "Describe the report you need.");
  if (list.length > 40) throw new HttpError(413, "The conversation is too long. Start a new one.");
  return list.map((m, i) => {
    const role = i % 2 === 0 ? "user" : "assistant";
    if (m?.role !== role) throw new HttpError(400, "The conversation is out of order.");
    if (role === "user") return { role, content: requireString(m.content, "message", { max: 20_000, allowEmpty: false }) };
    // Earlier answers go back in the same JSON shape the assistant replies in.
    return { role, content: JSON.stringify({ sql: optionalString(m.sql, "sql", 200_000), explanation: optionalString(m.explanation, "explanation", 20_000) }) };
  });
}

/** Asks the AI with the database's schema file and the knowledge base. */
async function ask(database, messages) {
  const schema = await loadSchema(database, { maxChars: settings.aiSchemaMaxChars });
  const knowledge = await loadKnowledge(database);
  return writeQuery({ schema, database, knowledge, messages },
    { backend: settings.aiBackend, model: settings.aiModel, effort: settings.aiEffort, timeoutMs: settings.aiTimeoutMs });
}

export default function aiRoutes() {
  const router = Router();

  /** GET /api/databases -> { databases: [{ name, tables }] }: the databases with a schema file to write queries for. */
  router.get("/databases", asyncHandler(async (req, res) => {
    res.json({ databases: await listSchemas() });
  }));

  /**
   * POST /api/ai/query { database, messages: [{role: "user", content} | {role: "assistant", sql, explanation}], sql? }
   * -> { sql, explanation, columns, table }. `sql` is what's in the editor now, so "add a filter for…" works on it.
   * `columns` are the report's columns, worked out by the AI since the query is never run.
   */
  router.post("/ai/query", asyncHandler(async (req, res) => {
    const database = requireString(req.body?.database, "database", { max: 128, allowEmpty: false });
    const messages = readMessages(req.body?.messages);
    if (messages.at(-1).role !== "user") throw new HttpError(400, "The conversation is out of order.");
    const current = optionalString(req.body?.sql, "sql", 200_000).trim();
    if (current) messages.at(-1).content += `\n\nThe query in the editor right now:\n\`\`\`sql\n${current}\n\`\`\``;

    const answer = await ask(database, messages);
    const columns = answer.sql && answer.columns.length ? toColumns(answer.columns) : [];
    res.json({ sql: answer.sql, explanation: answer.explanation, columns, table: firstTableName(answer.sql) });
  }));

  /**
   * POST /api/ai/columns { database, sql } -> { columns, table, note }: the columns of a query the user wrote themselves.
   * `note` is the AI's warning when the query uses names that aren't in the schema.
   */
  router.post("/ai/columns", asyncHandler(async (req, res) => {
    const database = requireString(req.body?.database, "database", { max: 128, allowEmpty: false });
    const sql = requireString(req.body?.sql, "sql", { allowEmpty: false });
    const problem = checkReadOnly(sql);
    if (problem) throw new HttpError(422, problem);
    const answer = await ask(database, [{ role: "user", content: describeRequest(sql) }]);
    res.json({ columns: toColumns(answer.columns), table: firstTableName(sql), note: answer.explanation });
  }));

  return router;
}
