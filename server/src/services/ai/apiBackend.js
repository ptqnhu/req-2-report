import Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "../../lib/errors.js";
import { INSTRUCTIONS, OUTPUT_SCHEMA, databaseContext, toAnswer } from "./prompt.js";

let defaultClient;
const getClient = () => (defaultClient ??= new Anthropic());

/** Turns SDK errors into messages the person using the app can act on. */
function friendlyError(e) {
  if (e instanceof HttpError) return e;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new HttpError(503, "The AI assistant's API key was rejected. Check ANTHROPIC_API_KEY on the app's server.");
  }
  if (e instanceof Anthropic.RateLimitError) return new HttpError(429, "The AI assistant is busy. Try again in a minute.");
  if (e instanceof Anthropic.BadRequestError) return new HttpError(422, `The AI assistant couldn't take that request: ${e.message}`);
  if (e instanceof Anthropic.APIError) return new HttpError(502, "The AI assistant isn't responding right now. Try again shortly.");
  // Anything else failed before reaching the API: local setup, most often no API key at all.
  console.error("AI assistant:", e.message);
  return new HttpError(503, "The AI assistant isn't set up. Set ANTHROPIC_API_KEY on the app's server and restart it.");
}

/** Asks Claude for a query through the Claude API, with ANTHROPIC_API_KEY. */
export async function writeQueryWithApi({ schema, database, knowledge, messages }, { model, effort, client } = {}) {
  let response;
  try {
    response = await (client ?? getClient()).beta.messages.create({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort, format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      system: [
        { type: "text", text: INSTRUCTIONS },
        // The schema and knowledge base are the large, unchanging part, so they're cached between questions about the same database.
        { type: "text", text: databaseContext({ database, schema, knowledge }), cache_control: { type: "ephemeral" } },
      ],
      messages,
    });
  } catch (e) {
    throw friendlyError(e);
  }

  if (response.stop_reason === "refusal") throw new HttpError(422, "The AI assistant declined this request. Try rewording it.");
  if (response.stop_reason === "max_tokens") throw new HttpError(502, "The AI assistant's answer was cut off. Try a narrower request.");
  const text = response.content.find((b) => b.type === "text")?.text;
  try {
    return toAnswer(JSON.parse(text));
  } catch {
    throw new HttpError(502, "The AI assistant sent an answer the app couldn't read. Try again.");
  }
}
