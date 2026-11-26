import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { listSchemas, loadSchema } from "../src/services/ai/schema.js";
import { loadKnowledge } from "../src/services/ai/knowledge.js";
import { writeQuery } from "../src/services/ai/queryWriter.js";
import { toColumns } from "../src/services/columns.js";
import { databaseContext } from "../src/services/ai/prompt.js";
import { databaseName, switchDatabase } from "@req-2-report/shared";
import { readEnvironment } from "../src/routes/ai.js";

test("APM is Repl_APM in production and sandbox, APM in QA; other databases keep their name", () => {
  assert.equal(databaseName("APM", "production"), "Repl_APM");
  assert.equal(databaseName("apm", "sandbox"), "Repl_APM");
  assert.equal(databaseName("APM", "qa"), "APM");
  assert.equal(databaseName("NLS", "production"), "NLS");
});

test("switching environment renames the database in the query, and nothing else", () => {
  const prod = "SELECT l.loan_no FROM Repl_APM.dbo.loan l JOIN [Repl_APM].dbo.loan_history h ON h.loan_no = l.loan_no";
  const qa = "SELECT l.loan_no FROM APM.dbo.loan l JOIN [APM].dbo.loan_history h ON h.loan_no = l.loan_no";
  assert.equal(switchDatabase(prod, "APM", "production", "qa"), qa);
  assert.equal(switchDatabase(qa, "APM", "qa", "sandbox"), prod);
  assert.equal(switchDatabase(prod, "APM", "production", "sandbox"), prod); // same name in both
  assert.equal(switchDatabase("SELECT * FROM MyAPM.dbo.x", "APM", "qa", "production"), "SELECT * FROM MyAPM.dbo.x");
  assert.equal(switchDatabase("SELECT * FROM NLS.dbo.acct", "NLS", "production", "qa"), "SELECT * FROM NLS.dbo.acct");
});

test("environment: production when not given, case ignored, anything else refused", () => {
  assert.equal(readEnvironment(undefined), "production");
  assert.equal(readEnvironment(" QA "), "qa");
  assert.throws(() => readEnvironment("staging"), (e) => e.status === 400);
});

test("the prompt tells the AI the database's name where the report runs, only when it differs", () => {
  const prod = databaseContext({ database: "APM", sqlName: "Repl_APM", schema: "dbo.loan (table): loan_no int" });
  assert.match(prod, /^Database: APM\nWhere this report runs the database is named Repl_APM: write every table as Repl_APM\.dbo\.<table>/);
  assert.equal(databaseContext({ database: "APM", sqlName: "APM", schema: "s" }), "Database: APM\n\nSchema:\ns");
});

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
    "glossary/funding.yaml": "# header\n- term: funded\n  sql: x  # inline note stays\n",
    "glossary/customer.yaml": "- term: Borrowers\n",
    "gotchas.md": "# Gotchas\n\n- trap\n",
    "notes.yaml": "- extra\n",
    "README.md": "# For people only\n",
    "tables/APM/loan.yaml": "name: APM.dbo.loan\n",
    "tables/NLS/acct.yaml": "name: NLS.dbo.acct\n",
    "golden/q1.yaml": "request: secret answer\n",
  };
  for (const [name, text] of Object.entries(files)) {
    await mkdir(dirname(join(dir, name)), { recursive: true });
    await writeFile(join(dir, name), text, "utf8");
  }
  const text = await loadKnowledge("apm", dir);
  assert.match(text, /^### glossary\/customer\.yaml\n- term: Borrowers\n\n### glossary\/funding\.yaml\n- term: funded\n  sql: x  # inline note stays\n\n### gotchas\.md\n# Gotchas/);
  assert.match(text, /### tables\/APM\/loan\.yaml\nname: APM\.dbo\.loan$/);
  assert.match(text, /### gotchas\.md\n# Gotchas\n\n- trap\n\n### notes\.yaml\n- extra\n\n### tables/);
  assert.doesNotMatch(text, /# header|NLS|secret|joins|For people/);
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
