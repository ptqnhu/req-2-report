import { HttpError } from "../../lib/errors.js";
import { writeQueryWithCli } from "./cliBackend.js";
import { writeQueryWithApi } from "./apiBackend.js";

/** AI_BACKEND picks how the app reaches Claude: "cli" (Claude Code, headless) or "api" (ANTHROPIC_API_KEY). */
const BACKENDS = { cli: writeQueryWithCli, api: writeQueryWithApi };
export const AI_BACKENDS = Object.keys(BACKENDS);

/**
 * Asks Claude for a query.
 * @param {{schema: string, database: string, knowledge?: string, messages: {role: "user"|"assistant", content: string}[]}} input
 * @param {{backend?: "cli"|"api", model?: string, effort?: string, timeoutMs?: number}} options the rest go to the backend
 * @returns {Promise<{sql: string, explanation: string}>}
 */
export async function writeQuery(input, { backend = "cli", ...options } = {}) {
  const write = BACKENDS[backend];
  if (!write) throw new HttpError(503, `Unknown AI_BACKEND "${backend}". Use ${AI_BACKENDS.join(" or ")}.`);
  return write(input, options);
}
