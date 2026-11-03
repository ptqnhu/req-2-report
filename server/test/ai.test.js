import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { listSchemas, loadSchema } from "../src/services/ai/schema.js";
import { loadKnowledge } from "../src/services/ai/knowledge.js";
import { writeQuery } from "../src/services/ai/queryWriter.js";
import { toColumns } from "../src/services/columns.js";

/** A stand-in for the Claude CLI that records how it was run and prints a canned result. */
function fakeCli(result) {
  const calls = [];
  const run = async (cli, args, input) => { calls.push({ cli, args, input }); return JSON.stringify(result); };
  return { calls, run };
}

const answer = (structured_output) => ({ type: "result", subtype: "success", is_error: false, structured_output });

async function schemaDir(files) {
  const dir = await mkdtemp(join(tmpdir(), "schemas-"));
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text, "utf8");
  return dir;
}

test("schema comes from the database's file, ignoring case and # comment lines", async () => {
  const dir = await schemaDir({ "APM.txt": "# notes\r\ndbo.loan (table): loan_no int\r\n# more\r\n" });
  assert.equal(await loadSchema("apm", { maxChars: 10_000, dir }), "dbo.loan (table): loan_no int");
});

test("schema refuses a database with no file or only a template, and one too large to send", async () => {
  const dir = await schemaDir({ "NLS.txt": "# template\n# dbo.Example (table): ID int\n", "APM.txt": "dbo.loan (table): loan_no int\n" });
  await assert.rejects(loadSchema("NLS", { maxChars: 10_000, dir }), (e) => e.status === 404);
  await assert.rejects(loadSchema("Sales", { maxChars: 10_000, dir }), (e) => e.status === 404);
  await assert.rejects(loadSchema("APM", { maxChars: 5, dir }), (e) => e.status === 413);
});

test("the database list has only filled-in schema files, with their table counts", async () => {
  const dir = await schemaDir({
    "NLS.txt": "# template\n", "notes.md": "x",
    "APM.txt": "dbo.loan (table): loan_no int\ndbo.v (view): a int\n\nForeign keys:\ndbo.v.a -> dbo.loan.loan_no\n",
  });
  assert.deepEqual(await listSchemas(dir), [{ name: "APM", tables: 2 }]);
});

test("the AI's column list becomes the report's columns, with unique names", () => {
  const cols = toColumns([{ name: "loan_no", type: "int" }, { name: "", type: "decimal(18,4)" }, { name: "Loan_No", type: "varchar(10)" }]);
  assert.deepEqual(cols.map((c) => [c.name, c.type, c.sqlType, c.unnamed, c.dup]),
    [["loan_no", "Integer", "int", false, false], ["Column2", "Decimal", "decimal(18,4)", true, false], ["Loan_No_2", "Text", "varchar(10)", false, true]]);
  assert.throws(() => toColumns([]), (e) => e.status === 422);
});

test("knowledge: shared files and the database's tables, without YAML comments or golden queries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "knowledge-"));
  const files = {
    "glossary.yaml": "# header\n- term: funded\n  sql: x  # inline note stays\n",
    "gotchas.md": "# Gotchas\n\n- trap\n",
    "tables/APM/loan.yaml": "name: APM.dbo.loan\n",
    "tables/NLS/acct.yaml": "name: NLS.dbo.acct\n",
    "golden/q1.yaml": "request: secret answer\n",
  };
  for (const [name, text] of Object.entries(files)) {
    await mkdir(dirname(join(dir, name)), { recursive: true });
    await writeFile(join(dir, name), text, "utf8");
  }
  const text = await loadKnowledge("apm", dir);
  assert.match(text, /^### glossary\.yaml\n- term: funded\n  sql: x  # inline note stays\n\n### gotchas\.md\n# Gotchas/);
  assert.match(text, /### tables\/APM\/loan\.yaml\nname: APM\.dbo\.loan$/);
  assert.doesNotMatch(text, /# header|NLS|secret|joins/);
  assert.equal(await loadKnowledge("APM", join(dir, "missing")), "");
});

test("both backends put the knowledge base after the schema", async () => {
  const input = { schema: "dbo.T (table): A int", database: "Sales", knowledge: "### gotchas.md\n- trap", messages: [{ role: "user", content: "q" }] };
  const client = fakeApiClient({ sql: "SELECT 1", explanation: "" });
  await writeQuery(input, { backend: "api", client });
  assert.match(client.calls[0].system.at(-1).text, /Schema:\ndbo\.T[\s\S]*Knowledge base:\n### gotchas\.md\n- trap$/);

  let prompt;
  const run = async (cli, args) => {
    prompt = await readFile(args[args.indexOf("--system-prompt-file") + 1], "utf8");
    return JSON.stringify(answer({ sql: "SELECT 1", explanation: "" }));
  };
  await writeQuery(input, { cliPath: "claude", run });
  assert.match(prompt, /Schema:\ndbo\.T[\s\S]*Knowledge base:\n### gotchas\.md\n- trap$/);
});

test("the cli backend runs Claude Code headless with no tools, asks for JSON and returns the query", async () => {
  const cli = fakeCli(answer({ sql: " SELECT 1 AS One ", explanation: "Returns one.", columns: [{ name: "One", type: "int" }] }));
  const out = await writeQuery({ schema: "dbo.T (table): A int", database: "Sales", messages: [{ role: "user", content: "one" }] },
    { model: "claude-opus-5-5", effort: "high", cliPath: "claude", run: cli.run });
  assert.deepEqual(out, { sql: "SELECT 1 AS One", explanation: "Returns one.", columns: [{ name: "One", type: "int" }] });
  const { args, input } = cli.calls[0];
  assert.equal(input, "one");
  for (const flag of ["-p", "--json-schema", "--system-prompt-file", "--no-session-persistence"]) assert.ok(args.includes(flag), flag);
  assert.equal(args[args.indexOf("--tools") + 1], "");
  assert.equal(args[args.indexOf("--model") + 1], "claude-opus-5-5");
});

test("the cli backend sends earlier turns as a transcript", async () => {
  const cli = fakeCli(answer({ sql: "SELECT 2", explanation: "" }));
  await writeQuery({ schema: "x", database: "d", messages: [
    { role: "user", content: "first" }, { role: "assistant", content: '{"sql":"SELECT 1"}' }, { role: "user", content: "second" },
  ] }, { cliPath: "claude", run: cli.run });
  assert.match(cli.calls[0].input, /User:\nfirst[\s\S]*You answered:\n\{"sql":"SELECT 1"\}[\s\S]*latest request:\nsecond$/);
});

test("the cli backend reports CLI errors and unreadable output", async () => {
  const input = { schema: "x", database: "d", messages: [{ role: "user", content: "q" }] };
  await assert.rejects(writeQuery(input, { cliPath: "claude", run: fakeCli({ is_error: true, result: "Not logged in" }).run }),
    (e) => e.status === 502 && /Not logged in/.test(e.message));
  await assert.rejects(writeQuery(input, { cliPath: "claude", run: async () => "oops" }), (e) => e.status === 502);
});

/** A stand-in for the Anthropic API client that records the request and returns a canned answer. */
function fakeApiClient(answer, { stop_reason = "end_turn" } = {}) {
  const calls = [];
  return {
    calls,
    beta: { messages: { async create(req) { calls.push(req); return { stop_reason, content: [{ type: "text", text: JSON.stringify(answer) }] }; } } },
  };
}

test("the api backend caches the schema prompt, asks for JSON and returns the query", async () => {
  const client = fakeApiClient({ sql: " SELECT 1 AS One ", explanation: "Returns one." });
  const out = await writeQuery({ schema: "dbo.T (table): A int", database: "Sales", messages: [{ role: "user", content: "one" }] },
    { backend: "api", model: "claude-opus-5-5", effort: "high", client });
  assert.deepEqual(out, { sql: "SELECT 1 AS One", explanation: "Returns one.", columns: [] });
  const req = client.calls[0];
  assert.equal(req.model, "claude-opus-5-5");
  assert.equal(req.output_config.format.type, "json_schema");
  assert.deepEqual(req.system.at(-1).cache_control, { type: "ephemeral" });
  assert.match(req.system.at(-1).text, /Database: Sales[\s\S]*dbo\.T \(table\)/);
});

test("the api backend reports refusals and cut-off answers", async () => {
  const input = { schema: "x", database: "d", messages: [{ role: "user", content: "q" }] };
  await assert.rejects(writeQuery(input, { backend: "api", client: fakeApiClient({}, { stop_reason: "refusal" }) }), (e) => e.status === 422);
  await assert.rejects(writeQuery(input, { backend: "api", client: fakeApiClient({}, { stop_reason: "max_tokens" }) }), (e) => e.status === 502);
});

test("an unknown AI_BACKEND is a readable error", async () => {
  await assert.rejects(writeQuery({ schema: "x", database: "d", messages: [] }, { backend: "gpt" }),
    (e) => e.status === 503 && /AI_BACKEND "gpt"/.test(e.message));
});
