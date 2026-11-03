import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TPL, DEFAULT_EXPORT, effectiveColumns, keyBy, suggestSlicers, applySlicers, sliceOptions, liveSlicers, describeSlices } from "@req-2-report/shared";
import { toColumns } from "../src/services/columns.js";
import { buildRdl } from "../src/rdl/buildRdl.js";
import { planSlicers } from "../src/rdl/slicers.js";
import { distinctValuesQuery, countQuery } from "../src/rdl/sqlWrap.js";

const flat = (s) => s.replace(/\s+/g, " ").trim();

test("pick-list SQL wraps the query as a derived table", () => {
  assert.equal(flat(distinctValuesQuery("SELECT status, total FROM dbo.Orders;", "status")),
    "SELECT DISTINCT ISNULL(NULLIF(RTRIM(CONVERT(nvarchar(4000), src.[status])), N''), N'(Blank)') AS Value FROM ( SELECT status, total FROM dbo.Orders ) AS src ORDER BY Value");
  // a final ORDER BY isn't allowed in a derived table, and doesn't change which rows there are
  assert.match(flat(distinctValuesQuery("SELECT a FROM t ORDER BY a DESC", "a")), /FROM \( SELECT a FROM t \) AS src/);
  // with TOP or OFFSET it decides the rows, so it stays
  assert.match(flat(distinctValuesQuery("SELECT TOP 10 a FROM t ORDER BY a DESC", "a")), /ORDER BY a DESC \) AS src/);
  assert.match(flat(distinctValuesQuery("SELECT a FROM t ORDER BY a OFFSET 5 ROWS", "a")), /OFFSET 5 ROWS \) AS src/);
  // ORDER BY inside OVER(), strings, comments and [names] are left alone
  const q = "SELECT a, ROW_NUMBER() OVER (ORDER BY b) AS n, 'order by' AS s, [order by] FROM t -- order by x\nORDER BY a";
  assert.match(distinctValuesQuery(q, "a"), /OVER \(ORDER BY b\).*'order by'.*\[order by\] FROM t -- order by x\n\) AS src/s);
  // CTEs stay in front; OPTION moves outside; the column name is bracket-quoted
  assert.equal(flat(distinctValuesQuery(";WITH x AS (SELECT a FROM t ORDER BY a OFFSET 0 ROWS) SELECT a AS [we]ird] FROM x ORDER BY 1 OPTION (RECOMPILE)", "we]ird")),
    "WITH x AS (SELECT a FROM t ORDER BY a OFFSET 0 ROWS) SELECT DISTINCT ISNULL(NULLIF(RTRIM(CONVERT(nvarchar(4000), src.[we]]ird])), N''), N'(Blank)') AS Value FROM ( SELECT a AS [we]ird] FROM x ) AS src ORDER BY Value OPTION (RECOMPILE)");
  assert.equal(distinctValuesQuery("SELECT a FROM t FOR JSON PATH", "a"), null);
});

test("count SQL wraps the query the same way", () => {
  assert.equal(flat(countQuery("SELECT status FROM dbo.Orders ORDER BY status;")), "SELECT COUNT_BIG(*) AS n FROM ( SELECT status FROM dbo.Orders ) AS src");
  assert.equal(flat(countQuery(";WITH x AS (SELECT a FROM t) SELECT a FROM x OPTION (RECOMPILE)")),
    "WITH x AS (SELECT a FROM t) SELECT COUNT_BIG(*) AS n FROM ( SELECT a FROM x ) AS src OPTION (RECOMPILE)");
  assert.equal(countQuery("SELECT a FROM t FOR XML PATH"), null);
});

const SQL = "SELECT order_id, status, region, order_date, is_paid, revenue, discount_rate FROM dbo.Orders ORDER BY order_date";
const columns = toColumns([
  { name: "order_id", type: "int" }, { name: "status", type: "nvarchar(20)" }, { name: "region", type: "nvarchar(20)" },
  { name: "order_date", type: "date" }, { name: "is_paid", type: "bit" }, { name: "revenue", type: "decimal(12,2)" }, { name: "discount_rate", type: "decimal(5,4)" },
]);
const effCols = effectiveColumns(columns, DEFAULT_TPL);
const colsByKey = keyBy(effCols);
const k = (n) => effCols.find((c) => c.name === n).key;
const SLICERS = [
  { col: k("status"), kind: "list" }, { col: k("region"), kind: "search" }, { col: k("order_date"), kind: "range" },
  { col: k("discount_rate"), kind: "range" }, { col: k("is_paid"), kind: "yesno" },
];
const build = (slicers, tplOver = {}, paramLayout = {}) => {
  const tpl = { ...DEFAULT_TPL, ...tplOver };
  return buildRdl({ sql: SQL, columns, effCols, tpl, title: "Orders", desc: "", filters: [], colsByKey, sort: null,
    exp: { ...DEFAULT_EXPORT, dsMode: "embedded", server: "s", database: "d" }, slicers: planSlicers(SQL, columns, slicers, colsByKey).slicers, paramLayout });
};

test("slicers become report parameters that filter the main dataset, starting on All", () => {
  const xml = build(SLICERS);
  // pick list: its own dataset of distinct values, multi-select, everything selected by default
  assert.match(xml, /<DataSet Name="Values_status"><Query><DataSourceName>MainDataSource<\/DataSourceName><CommandText>SELECT DISTINCT/);
  assert.match(xml, /<ReportParameter Name="status"><DataType>String<\/DataType><DefaultValue><DataSetReference><DataSetName>Values_status<\/DataSetName>.*<MultiValue>true<\/MultiValue><\/ReportParameter>/);
  assert.match(xml, /<Operator>In<\/Operator><FilterValues><FilterValue>=Parameters!status\.Value<\/FilterValue>/);
  // search box, date and percentage ranges (empty = no limit), yes/no
  assert.match(xml, /<ReportParameter Name="region"><DataType>String<\/DataType><DefaultValue><Values><Value>=""<\/Value>/);
  assert.match(xml, /<ReportParameter Name="order_date_From"><DataType>DateTime<\/DataType><Nullable>true<\/Nullable><DefaultValue><Values><Value>=Nothing<\/Value>/);
  assert.match(xml, /<Prompt>Discount Rate to \(%\)<\/Prompt>/);
  assert.match(xml, /CDbl\(Parameters!discount_rate_From\.Value\) \/ 100/);
  assert.match(xml, /<ParameterValue><Value>All<\/Value><Label>All<\/Label><\/ParameterValue>/);
  // the readers' choices are shown on the report; the parameter bar lays out all six parameters
  assert.match(xml, /<Textbox Name="SlicerSummary">.*=&quot;Showing:  &quot; &amp; &quot;Status: &quot; &amp; IIF\(Parameters!status\.Count &gt;= CountRows\(&quot;Values_status&quot;\), &quot;All&quot;/s);
  assert.match(xml, /<NumberOfRows>2<\/NumberOfRows>/);
  assert.equal((xml.match(/<CellDefinition>/g) || []).length, 7);
  assert.doesNotMatch(xml, /undefined|NaN/);
  assert.doesNotMatch(build([]), /ReportParameters|SlicerSummary|Values_/);
  assert.match(build(SLICERS, { theme: "ledger" }), /<Textbox Name="SlicerSummary">/);
});

test("pick lists fall back to a search box when the query can't be a subquery", () => {
  const cols = columns.map((c, i) => (i === 1 ? { ...c, dup: true } : c));
  const plan = planSlicers(SQL, cols, SLICERS, colsByKey);
  assert.equal(plan.slicers[0].kind, "search");
  assert.match(plan.warnings[0], /every column needs its own name/);
  assert.equal(planSlicers("SELECT status FROM t FOR XML PATH", columns, SLICERS.slice(0, 1), colsByKey).slicers[0].kind, "search");
});

test("suggestions, choices and the preview's slicing", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    [k("order_id")]: i, [k("status")]: ["Open", "Shipped", null][i % 3], [k("region")]: `R${i}`, [k("order_date")]: new Date(2026, 0, i + 1),
    [k("is_paid")]: i % 2 === 0, [k("revenue")]: i * 10, [k("discount_rate")]: i / 100,
  }));
  assert.deepEqual(suggestSlicers(effCols, rows).map((s) => [colsByKey[s.col].name, s.kind]), [["order_date", "range"], ["status", "list"], ["is_paid", "yesno"]]);
  assert.deepEqual(sliceOptions(rows, k("status")), ["(Blank)", "Open", "Shipped"]);
  const n = (values) => applySlicers(rows, SLICERS, values, colsByKey).length;
  assert.equal(n({}), 20);
  assert.equal(n({ [k("status")]: ["Open", "(Blank)"] }), 13);
  assert.equal(n({ [k("region")]: " r1" }), 11); // R1, R10–R19
  assert.equal(n({ [k("order_date")]: { from: "2026-01-05", to: "2026-01-10" } }), 6);
  assert.equal(n({ [k("discount_rate")]: { from: "", to: "4" } }), 5);
  assert.equal(n({ [k("is_paid")]: "No" }), 10);
  assert.equal(describeSlices(SLICERS, { [k("status")]: ["Open"], [k("order_date")]: { from: "2026-01-05" }, [k("discount_rate")]: { from: "2", to: "4" } }, colsByKey, DEFAULT_TPL),
    "Status: Open  |  Region: All  |  Order Date: from 01/05/2026  |  Discount Rate: 2% to 4%  |  Is Paid: All");
  // a type change resets a slicer to a kind that fits; removed columns drop out
  const typed = { ...colsByKey, [k("status")]: { ...colsByKey[k("status")], type: "Integer" } };
  assert.deepEqual(liveSlicers([...SLICERS, { col: "gone", kind: "list" }], typed).map((s) => s.kind), ["range", "search", "range", "range", "yesno"]);
});

test("date filters can start on a rolling or fixed default", async () => {
  const { presetRange, cleanDateDefault, slicerDefaults } = await import("@req-2-report/shared");
  const day = new Date(2026, 4, 20); // Wed 20 May 2026
  assert.deepEqual(presetRange({ preset: "last7" }, day), { from: "2026-05-14", to: "2026-05-20" });
  assert.deepEqual(presetRange({ preset: "lastmonth" }, day), { from: "2026-04-01", to: "2026-04-30" });
  assert.deepEqual(presetRange({ preset: "qtd" }, day), { from: "2026-04-01", to: "2026-05-20" });
  assert.deepEqual(presetRange({ preset: "lastyear" }, new Date(2026, 0, 1)), { from: "2025-01-01", to: "2025-12-31" });
  assert.deepEqual(cleanDateDefault({ preset: "custom", from: "2026-01-01", to: "x'); DROP" }), { preset: "custom", from: "2026-01-01", to: "" });
  assert.deepEqual(cleanDateDefault({ preset: "bogus" }), { preset: "none", from: "", to: "" });
  assert.deepEqual(slicerDefaults([{ col: "a", kind: "range", def: { preset: "today" } }, { col: "b", kind: "list" }], day), { a: { from: "2026-05-20", to: "2026-05-20" } });

  const date = (def) => build([{ col: k("order_date"), kind: "range", def }]);
  assert.match(date({ preset: "mtd" }), /<ReportParameter Name="order_date_From">.*<Value>=DateSerial\(Year\(Today\), Month\(Today\), 1\)<\/Value>.*<ReportParameter Name="order_date_To">.*<Value>=Today<\/Value>/s);
  assert.match(date({ preset: "last30" }), /<Value>=DateAdd\(&quot;d&quot;, -29, Today\)<\/Value>/);
  assert.match(date({ preset: "custom", from: "2026-02-03", to: "" }), /<Value>=DateSerial\(2026, 2, 3\)<\/Value>.*order_date_To.*<Value>=Nothing<\/Value>/s);
  assert.equal((date({ preset: "none" }).match(/<Value>=Nothing<\/Value>/g) || []).length, 2);
  // a default only applies to dates
  assert.deepEqual(liveSlicers([{ col: k("revenue"), kind: "range", def: { preset: "mtd" } }], colsByKey), [{ col: k("revenue"), kind: "range" }]);
});

test("parameter bar grid: saved positions, swaps, growth and the exported layout", async () => {
  const { layoutGrid, slicerItems } = await import("@req-2-report/shared");
  const ids = ["a", "b", "c", "d", "e"];
  assert.deepEqual(layoutGrid(ids, {}), { cols: 4, rows: 2, cells: { a: [0, 0], b: [0, 1], c: [0, 2], d: [0, 3], e: [1, 0] } });
  // saved spots win (the earlier filter on a clash); off-grid and junk positions fall into the first free cells
  assert.deepEqual(layoutGrid(ids, { cols: 3, rows: 3, cells: { e: [2, 2], a: [2, 2], b: [0, 9], c: "x" } }).cells,
    { a: [2, 2], b: [0, 0], c: [0, 1], d: [0, 2], e: [1, 0] });
  // too few cells: the grid grows; columns are clamped
  assert.equal(layoutGrid(ids, { cols: 1, rows: 1 }).rows, 5);
  assert.equal(layoutGrid(ids, { cols: 99 }).cols, 8);
  assert.deepEqual(layoutGrid([], { cols: 2 }), { cols: 2, rows: 0, cells: {} });
  assert.deepEqual(slicerItems(SLICERS.slice(1, 3)).map((i) => i.id), [k("region"), `${k("order_date")}:from`, `${k("order_date")}:to`]);

  // exported: 3 columns, 3 rows, the date range moved to the bottom row, "to" before "from"
  const xml = build(SLICERS.slice(0, 3), {}, { cols: 3, rows: 3, cells: { [`${k("order_date")}:to`]: [2, 0], [`${k("order_date")}:from`]: [2, 2] } });
  assert.match(xml, /<NumberOfColumns>3<\/NumberOfColumns><NumberOfRows>3<\/NumberOfRows>/);
  assert.match(xml, /<ColumnIndex>0<\/ColumnIndex><RowIndex>2<\/RowIndex><ParameterName>order_date_To<\/ParameterName>/);
  assert.match(xml, /<ColumnIndex>2<\/ColumnIndex><RowIndex>2<\/RowIndex><ParameterName>order_date_From<\/ParameterName>/);
  assert.match(xml, /<ColumnIndex>0<\/ColumnIndex><RowIndex>0<\/RowIndex><ParameterName>status<\/ParameterName>/);
});

test("renamed filters: prompts, the Showing line and cleaning", async () => {
  const { cleanPrompts, describeSlices } = await import("@req-2-report/shared");
  const renamed = [
    { col: k("status"), kind: "list", prompts: { main: "Order status <all>" } },
    { col: k("order_date"), kind: "range", prompts: { from: "Start", to: "" } },
  ];
  const xml = build(renamed);
  assert.match(xml, /<ReportParameter Name="status">.*<Prompt>Order status &lt;all&gt;<\/Prompt>/);
  assert.match(xml, /<ReportParameter Name="order_date_From">.*<Prompt>Start<\/Prompt>/);
  assert.match(xml, /<ReportParameter Name="order_date_To">.*<Prompt>Order Date to<\/Prompt>/); // empty name = default
  assert.match(xml, /&quot;Order status &lt;all&gt;: &quot; &amp; IIF\(Parameters!status\.Count/); // the Showing line uses it
  assert.match(xml, /&quot;Order Date: &quot; &amp; IIF\(IsNothing/); // a range keeps the column's name there
  assert.equal(describeSlices(renamed, {}, colsByKey, DEFAULT_TPL), "Order status <all>: All  |  Order Date: All");
  assert.deepEqual(cleanPrompts({ main: "  Region  ", from: 5, to: "x".repeat(150), evil: "y" }), { main: "Region", to: "x".repeat(100) });
  assert.equal(cleanPrompts({ main: "   " }), undefined);
});
