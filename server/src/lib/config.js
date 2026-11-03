// All runtime settings in one place. Every value can be overridden with an environment variable.
const num = (v, fallback) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : fallback);

export const settings = {
  port: num(process.env.PORT, 4000),
  /**
   * AI query assistant. Backend "cli" runs the Claude Code CLI headless with its signed-in account;
   * "api" calls the Claude API with ANTHROPIC_API_KEY. Then model, effort, time limit (CLI) and how much schema it may be sent.
   */
  aiBackend: (process.env.AI_BACKEND || "cli").trim().toLowerCase(),
  aiModel: process.env.AI_MODEL || "claude-opus-5-5",
  aiEffort: process.env.AI_EFFORT || "high",
  aiTimeoutMs: num(process.env.AI_TIMEOUT_SECONDS, 180) * 1000,
  aiSchemaMaxChars: num(process.env.AI_SCHEMA_MAX_CHARS, 1_500_000),
};
