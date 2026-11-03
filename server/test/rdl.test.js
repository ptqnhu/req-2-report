import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TPL, DEFAULT_EXPORT, effectiveColumns, keyBy } from "@req-2-report/shared";
import { toColumns } from "../src/services/columns.js";
import { buildRdl, validateExport, exportWarnings } from "../src/rdl/buildRdl.js";

const SQL = "SELECT order_id, status, order_date, is_paid, revenue, discount_rate FROM dbo.Orders";
const columns = toColumns([
  { name: "order_id", type: "int" }, { name: "status", type: "nvarchar(20)" }, { name: "order_date", type: "date" },
  { name: "is_paid", type: "bit" }, { name: "revenue", type: "decimal(12,2)" }, { name: "discount_rate", type: "decimal(5,4)" },
]);

function build(over = {}, tplOver = {}) {
  const tpl = { ...DEFAULT_TPL, rowNumbers: true, org: "Acme & Co", footer: "=not an expression", ...tplOver };
  const effCols = effectiveColumns(columns, tpl);
  const k = (n) => effCols.find((c) => c.name === n).key;
  const filters = [
    { id: "1", col: k("status"), op: "contains", value: 'Ship"d', value2: "" },
    { id: "2", col: k("revenue"), op: "between", value: "10", value2: "500" },
    { id: "3", col: k("order_date"), op: "after", value: "2026-02-01", value2: "" },
    { id: "4", col: k("is_paid"), op: "true", value: "", value2: "" },
  ];
  const exp = { ...DEFAULT_EXPORT, dsMode: "embedded", server: "sql01", database: "Shop", ...over };
  return buildRdl({ sql: SQL, columns, effCols, tpl, title: "Orders", desc: "", filters, colsByKey: keyBy(effCols), sort: { key: k("revenue"), dir: "desc" }, exp });
}

const balanced = (xml) => {
  const stack = [];
  for (const m of xml.replace(/<\?xml[^>]*\?>/, "").matchAll(/<(\/?)([\w:]+)[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (m[1]) { if (stack.pop() !== m[2]) return false; } else stack.push(m[2]);
  }
  return stack.length === 0;
};

test("builds balanced XML for both schemas and filter modes", () => {
  for (const schema of ["2016", "2010"]) for (const filterMode of ["fixed", "params"]) {
    const xml = build({ schema, filterMode });
    assert.ok(balanced(xml), `${schema}/${filterMode} is not well-formed`);
    assert.doesNotMatch(xml, /undefined|NaN/);
  }
});

test("data source: Windows uses integrated security; SQL login leaves credentials to the server", () => {
  assert.match(build({ dsAuth: "windows" }), /<IntegratedSecurity>true<\/IntegratedSecurity>.*<rd:SecurityType>Integrated/s);
  const sqlAuth = build({ dsAuth: "sql" });
  assert.doesNotMatch(sqlAuth, /IntegratedSecurity/);
  assert.match(sqlAuth, /<rd:SecurityType>DataBase<\/rd:SecurityType>/);
  assert.match(build({ dsMode: "shared", dsRef: "/Data Sources/Shop" }), /<DataSourceReference>\/Data Sources\/Shop<\/DataSourceReference>/);
});

test("fixed filters are embedded; parameter mode creates report parameters", () => {
  assert.match(build({ filterMode: "fixed" }), /<Operator>Between<\/Operator>/);
  const p = build({ filterMode: "params" });
  assert.match(p, /<ReportParameter Name="P_revenue_From">/);
  assert.match(p, /<ReportParametersLayout>/);
  assert.doesNotMatch(build({ filterMode: "params", schema: "2010" }), /ReportParametersLayout/);
});

test("sort, formats and escaping", () => {
  const xml = build();
  assert.match(xml, /<Direction>Descending<\/Direction>/);
  assert.match(xml, /<Format>'\$'#,0\.00;-'\$'#,0\.00<\/Format>/);
  assert.match(xml, /<Format>0\.00%<\/Format>/);
  assert.match(xml, /Acme &amp; Co/i); // the LoanMart band shows it in capitals
  assert.match(xml, /=&quot;=not an expression&quot;/);
});

test("LoanMart style: green band with the embedded logo and gold stripe, as wide as the table", () => {
  const xml = build();
  assert.match(xml, /<Rectangle Name="HeaderBand">.*<BackgroundColor>#0F5131<\/BackgroundColor>/s);
  assert.match(xml, /<Image Name="Logo"><Source>Embedded<\/Source><Value>LoanMartLogo<\/Value>/);
  // the logo fills the band's left end: at its top-left corner and exactly as tall as the band
  const logo = xml.match(/<Image Name="Logo">.*?<Top>0in<\/Top><Left>0in<\/Left><Height>([\d.]+)in<\/Height><Width>([\d.]+)in<\/Width>/);
  const bandH = xml.match(/<\/ReportItems><KeepTogether>true<\/KeepTogether><Top>0in<\/Top><Left>0in<\/Left><Height>([\d.]+)in<\/Height>/)[1];
  assert.ok(logo, "logo is flush with the band's top-left corner");
  assert.equal(logo[1], bandH);
  assert.match(xml, /<EmbeddedImage Name="LoanMartLogo"><MIMEType>image\/png<\/MIMEType><ImageData>iVBOR/);
  assert.match(xml, /<Rectangle Name="GoldStripe">/);
  assert.doesNotMatch(xml, /Summary1/); // no summary figures in the band
  // one info line: Generated <date>  ·  6 columns  ·  <rows>
  assert.match(xml, /<Textbox Name="ReportMeta">.*?&quot;Generated &quot; &amp; Format\(Globals!ExecutionTime, &quot;MM'\/'dd'\/'yyyy&quot;\) &amp; &quot;  ·  6 columns  ·  &quot; &amp; Format\(CountRows\(&quot;MainDataSet&quot;\), &quot;#,0&quot;\)/s);

  // A table wider than the page: the band and stripe still run to its end (6 wide columns + row numbers = 16.05in)
  const wide = build({}, { cols: Object.fromEntries(columns.map((c) => [c.name, { width: "wide" }])) });
  assert.match(wide, /<Rectangle Name="HeaderBand">.*?<\/ReportItems><KeepTogether>true<\/KeepTogether><Top>0in<\/Top><Left>0in<\/Left><Height>[\d.]+in<\/Height><Width>16\.05in<\/Width>/s);
  assert.match(wide, /<Rectangle Name="GoldStripe"><Top>[\d.]+in<\/Top><Left>0in<\/Left><Height>[\d.]+in<\/Height><Width>16\.05in<\/Width>/);

  const plain = build({}, { logo: false });
  assert.ok(balanced(plain));
  assert.doesNotMatch(plain, /LoanMartLogo|<Image Name="Logo"/);
  // the "LM" line art stays: baked into the band's background image, made at the band's size (96 px per inch)
  assert.match(plain, /<BackgroundImage><Source>Embedded<\/Source><Value>LoanMartBand<\/Value><BackgroundRepeat>Clip<\/BackgroundRepeat><\/BackgroundImage>/);
  const png = Buffer.from(plain.match(/<EmbeddedImage Name="LoanMartBand"><MIMEType>image\/png<\/MIMEType><ImageData>([^<]+)</)[1], "base64");
  const band = plain.match(/<\/ReportItems><KeepTogether>true<\/KeepTogether><Top>0in<\/Top><Left>0in<\/Left><Height>([\d.]+)in<\/Height><Width>([\d.]+)in<\/Width>/);
  assert.equal(png.readUInt32BE(16), Math.round(+band[2] * 96));
  assert.equal(png.readUInt32BE(20), Math.round(+band[1] * 96));
  assert.doesNotMatch(plain, /<Image Name="BandLines"/); // never an item over the text: SSRS's viewer would move it
});

test("other styles keep their own header and no logo", () => {
  const xml = build({}, { theme: "ledger" });
  assert.ok(balanced(xml));
  assert.doesNotMatch(xml, /HeaderBand|EmbeddedImage/);
  assert.match(xml, /<BackgroundColor>#18233A<\/BackgroundColor>/);
});

test("export settings and warnings", () => {
  assert.ok(validateExport({ ...DEFAULT_EXPORT }));
  assert.equal(validateExport({ ...DEFAULT_EXPORT, dsMode: "embedded", server: "s", database: "d" }), "");
  assert.equal(exportWarnings([{ name: "Column3", unnamed: true }])[0].startsWith("Column 3 has no name"), true);
});

test("display options reach the .rdl: formats, yes/no labels and text case", () => {
  const tpl = { ...DEFAULT_TPL, cols: { revenue: { display: "k" }, is_paid: { display: "yn" }, status: { display: "upper" } } };
  const effCols = effectiveColumns(columns, tpl);
  const xml = buildRdl({ sql: SQL, columns, effCols, tpl, title: "Orders", desc: "", filters: [], colsByKey: keyBy(effCols), sort: null,
    exp: { ...DEFAULT_EXPORT, dsMode: "embedded", server: "s", database: "d" } });
  assert.match(xml, /<Value>=Fields!revenue\.Value<\/Value><Style>.*?<Format>'\$'#,0,\.0&quot;K&quot;;-'\$'#,0,\.0&quot;K&quot;<\/Format>/);
  assert.match(xml, /IIF\(CBool\(Fields!is_paid\.Value\), &quot;Y&quot;, &quot;N&quot;\)/);
  assert.match(xml, /<Value>=UCase\(Fields!status\.Value\)<\/Value>/);
});

test("template look and data type changes reach the .rdl; an unchanged template is unaffected", () => {
  const look = {
    band: { bg: "#112233", stripe: "#AA0000" },
    title: { color: "#FF0000", size: 28, bold: false },
    head: { bg: "#000080", color: "#FFFF00", size: 12 },
    rows: { zebra: "#FAFAD2", line: "#CCCCCC" },
    totals: { bg: "#DDDDDD" },
    footer: { color: "#123456", size: 10 },
  };
  const types = { Currency: { color: "#008000", bold: true, align: "center", display: "paren" } };
  const xml = build({}, { look, types });
  assert.ok(balanced(xml));
  assert.match(xml, /<BackgroundColor>#112233<\/BackgroundColor>/);
  assert.match(xml, /GoldStripe[\s\S]*?<BackgroundColor>#AA0000/);
  assert.match(xml, /<Textbox Name="ReportTitle">[\s\S]*?<FontSize>28pt<\/FontSize><Color>#FF0000/);
  assert.match(xml, /<Textbox Name="hdr_revenue">[\s\S]*?<FontSize>12pt<\/FontSize><FontWeight>Bold<\/FontWeight><Color>#FFFF00[\s\S]*?<BackgroundColor>#000080/);
  assert.match(xml, /&quot;#FAFAD2&quot;, &quot;White&quot;/);
  assert.match(xml, /<Textbox Name="FooterNote">[\s\S]*?<FontSize>10pt<\/FontSize><Color>#123456/);
  // revenue is decimal(12,2), so Currency: green, bold, centred, negatives in brackets
  const rev = xml.match(/<Textbox Name="val_revenue">[\s\S]*?<\/Textbox>/)[0];
  assert.match(rev, /<FontWeight>Bold<\/FontWeight><Color>#008000<\/Color><Format>'\$'#,0\.00;\('\$'#,0\.00\)/);
  assert.match(rev, /<TextAlign>Center<\/TextAlign>/);

  // No changes: same file as before the feature (apart from the random ids)
  const plain = (x) => x.replace(/<rd:(DataSourceID|ReportID)>[^<]+/g, "");
  assert.equal(plain(build({}, { look: {}, types: {} })), plain(build()));
});

test("Proper Case text is written with SSRS's StrConv", () => {
  const xml = build({}, { cols: { status: { display: "proper" } } });
  assert.match(xml, /<Textbox Name="val_status">[\s\S]*?<Value>=StrConv\(Fields!status\.Value, VbStrConv\.ProperCase\)<\/Value>/);
});
