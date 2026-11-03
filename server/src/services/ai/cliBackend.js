import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { HttpError } from "../../lib/errors.js";
import { findClaudeCli } from "./claudeCli.js";
import { INSTRUCTIONS, OUTPUT_SCHEMA, toAnswer } from "./prompt.js";

/** Earlier turns become a transcript, since each CLI run starts a fresh session. */
function toPrompt(messages) {
  if (messages.length === 1) return messages[0].content;
  const turns = messages.slice(0, -1).map((m) => (m.role === "user" ? `User:\n${m.content}` : `You answered:\n${m.content}`));
  return `The conversation so far:\n\n${turns.join("\n\n")}\n\nThe user's latest request:\n${messages.at(-1).content}`;
}

/** Runs the Claude CLI once and resolves with what it printed. */
function runCli(cli, args, input, { cwd, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cli, args, { cwd, windowsHide: true });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill(); reject(new HttpError(504, "The AI assistant took too long. Try a narrower request.")); }, timeoutMs);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e.code === "ENOENT"
        ? new HttpError(503, "Can't find the Claude CLI. Install Claude Code, or set CLAUDE_CLI_PATH to claude.exe.")
        : e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (out.trim()) resolve(out);
      else reject(new HttpError(502, `The AI assistant stopped (exit code ${code}). ${err.trim().split("\n").at(-1) || ""}`.trim()));
    });
    // If the CLI exits before reading the prompt, stdin errors with EPIPE; unhandled, that would stop the server.
    // The "close" handler above still reports the failure.
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

/**
 * Asks Claude for a query by running the Claude Code CLI headless (claude -p), signed in with
 * the account that's logged in to Claude Code on this computer. No tools, no saved session.
 */
export async function writeQueryWithCli({ schema, database, messages }, { model, effort, cliPath, timeoutMs = 180_000, run = runCli } = {}) {
  // The system prompt (with the whole schema) goes in a file: Windows caps a command line at 32,767 characters.
  const dir = await mkdtemp(path.join(tmpdir(), "rb-ai-"));
  let printed;
  try {
    const promptFile = path.join(dir, "system.txt");
    await writeFile(promptFile, `${INSTRUCTIONS}\n\nDatabase: ${database}\n\nSchema:\n${schema}`, "utf8");
    const args = [
      "-p", "--output-format", "json", "--json-schema", JSON.stringify(OUTPUT_SCHEMA),
      "--system-prompt-file", promptFile,
      "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence",
      ...(model ? ["--model", model] : []), ...(effort ? ["--effort", effort] : []),
    ];
    // Runs in the empty temp folder so no project files or CLAUDE.md are picked up.
    printed = await run(cliPath || findClaudeCli(), args, toPrompt(messages), { cwd: dir, timeoutMs });
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  let result;
  try { result = JSON.parse(printed); }
  catch { throw new HttpError(502, "The AI assistant sent an answer the app couldn't read. Try again."); }
  if (result.is_error) throw new HttpError(502, `The AI assistant couldn't answer: ${result.result || result.subtype}`);
  const out = result.structured_output;
  if (!out) throw new HttpError(502, "The AI assistant didn't return a query. Try rewording the request.");
  return toAnswer(out);
}
