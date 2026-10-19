import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSchema } from "../src/services/ai/schema.js";
import { writeQuery } from "../src/services/ai/queryWriter.js";

/** A pool whose first query returns the columns and second the foreign keys. */
function schemaPool(cols, keys = []) {
  const queries = [];
  return {
    queries,
    request: () => ({ async query(q) { queries.push(q); return { recordset: queries.length === 1 ? cols : keys }; } }),
  };
}

/** A stand-in for the Claude CLI that records how it was run and prints a canned result. */
function fakeCli(result) {
  const calls = [];
  const run = async (cli, args, input) => { calls.push({ cli, args, input }); return JSON.stringify(result); };
  return { calls, run };
}

const answer = (structured_output) => ({ type: "result", subtype: "success", is_error: false, structured_output });

test("schema lists tables, views, columns and foreign keys, and is read once per pool", async () => {
  const pool = schemaPool([
    { sch: "dbo", obj: "Customers", kind: "U ", col: "Id", type: "int" },
    { sch: "dbo", obj: "Customers", kind: "U ", col: "Name", type: "nvarchar" },
    { sch: "dbo", obj: "Loans", kind: "U ", col: "CustomerId", type: "int" },
    { sch: "rpt", obj: "ActiveLoans", kind: "V ", col: "LoanId", type: "int" },
  ], [{ fromTable: "dbo.Loans", fromCol: "CustomerId", toTable: "dbo.Customers", toCol: "Id" }]);
  const { text, source } = await loadSchema(pool, { maxChars: 10_000 });
  assert.equal(source, "database");
  assert.equal(text, [
    "dbo.Customers (table): Id int, Name nvarchar",
    "dbo.Loans (table): CustomerId int",
    "rpt.ActiveLoans (view): LoanId int",
    "",
    "Foreign keys:",
    "dbo.Loans.CustomerId -> dbo.Customers.Id",
  ].join("\n"));
  await loadSchema(pool, { maxChars: 10_000 });
  assert.equal(pool.queries.length, 2);
});

test("schema comes from the saved file for the database, ignoring case, without querying", async () => {
  const dir = await mkdtemp(join(tmpdir(), "schemas-"));
  await writeFile(join(dir, "AdventureWorks2022.txt"), "Sales.Customer (table): CustomerID int\n", "utf8");
  const pool = schemaPool([]);
  assert.deepEqual(await loadSchema(pool, { maxChars: 10_000, database: "adventureworks2022", dir }), { text: "Sales.Customer (table): CustomerID int", source: "file" });
  assert.equal(pool.queries.length, 0);

  const other = schemaPool([{ sch: "dbo", obj: "T", kind: "U", col: "A", type: "int" }]);
  assert.deepEqual(await loadSchema(other, { maxChars: 10_000, database: "Sales", dir }), { text: "dbo.T (table): A int", source: "database" });
  assert.equal(other.queries.length, 2);
  await assert.rejects(loadSchema(schemaPool([]), { maxChars: 5, database: "AdventureWorks2022", dir }), (e) => e.status === 413);
});

test("schema files skip # comment lines, and one with only comments is ignored", async () => {
  const dir = await mkdtemp(join(tmpdir(), "schemas-"));
  await writeFile(join(dir, "APN.txt"), "# notes\r\ndbo.Loan (table): LoanID int\r\n# more\r\n", "utf8");
  await writeFile(join(dir, "NLS.txt"), "# template\n# dbo.Example (table): ID int\n", "utf8");
  assert.deepEqual(await loadSchema(schemaPool([]), { maxChars: 10_000, database: "APN", dir }), { text: "dbo.Loan (table): LoanID int", source: "file" });
  const pool = schemaPool([{ sch: "dbo", obj: "T", kind: "U", col: "A", type: "int" }]);
  assert.deepEqual(await loadSchema(pool, { maxChars: 10_000, database: "NLS", dir }), { text: "dbo.T (table): A int", source: "database" });
});

test("schema refuses databases too large to send, and empty ones", async () => {
  const cols = [{ sch: "dbo", obj: "T", kind: "U", col: "A", type: "int" }];
  await assert.rejects(loadSchema(schemaPool(cols), { maxChars: 5 }), (e) => e.status === 413);
  await assert.rejects(loadSchema(schemaPool([]), { maxChars: 5 }), (e) => e.status === 422);
});

test("the cli backend runs Claude Code headless with no tools, asks for JSON and returns the query", async () => {
  const cli = fakeCli(answer({ sql: " SELECT 1 AS One ", explanation: "Returns one." }));
  const out = await writeQuery({ schema: "dbo.T (table): A int", database: "Sales", messages: [{ role: "user", content: "one" }] },
    { model: "claude-opus-5-5", effort: "high", cliPath: "claude", run: cli.run });
  assert.deepEqual(out, { sql: "SELECT 1 AS One", explanation: "Returns one." });
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
  assert.deepEqual(out, { sql: "SELECT 1 AS One", explanation: "Returns one." });
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
