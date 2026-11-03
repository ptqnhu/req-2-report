import { NUMERIC, idLike, alignOf, BRAND, LOANMART_LOGO_PNG, LOGO_SIZE, slicerItems, layoutGrid, booleanLabels, displayOf } from "@req-2-report/shared";
import { xesc, lit, inch, guid, rdlIdent, vbStr } from "./xml.js";
import { NET_TYPE, NET_DATE, THEME_RDL, DENSITY_RDL, netFormat, colWidth } from "./styles.js";
import { textbox } from "./textbox.js";
import { buildFilters } from "./filters.js";
import { bandBackgroundPng } from "./bandImage.js";
import { slicerRdl } from "./slicers.js";

const DATASET = "MainDataSet";
const DATASOURCE = "MainDataSource";

/** Returns a message if the export settings are incomplete, otherwise "". */
export function validateExport(exp) {
  if (exp.dsMode === "shared") return exp.dsRef.trim() ? "" : "Enter the shared data source path to export.";
  return exp.server.trim() && exp.database.trim() ? "" : "Enter the server and database to export.";
}

/** Things in the query that would break or misbehave in SSRS. */
export function exportWarnings(columns) {
  const w = [];
  columns.forEach((c) => {
    if (c.unnamed) w.push(`Column ${c.name.replace(/^Column/, "")} has no name. Add AS column_name in the query so SSRS can match it to a field.`);
    if (c.dup) w.push(`Two columns are named “${c.name.replace(/_\d+$/, "")}”. Give them different aliases in the query; SSRS needs unique field names.`);
  });
  return w;
}

const LOGO_IMAGE = "LoanMartLogo";
const BAND_IMAGE = "LoanMartBand";

/** The template's changes to one part of the report (tpl.look, see shared/look.js), or {} */
const lookPart = (tpl, part) => tpl.look?.[part] || {};

/**
 * A line of header text with the template's changes to its part applied. A bigger text size makes the line taller;
 * `h` (inches) is the height at the style's own size.
 */
function styledLine(tpl, part, line) {
  const o = lookPart(tpl, part);
  const size = o.size ?? line.size;
  const h = o.size ? Math.max(line.h, (size / 72) * 1.35 + 0.05) : line.h;
  return { ...line, size, color: o.color ?? line.color, bold: o.bold ?? line.bold, h };
}

/**
 * LoanMart header band: a green panel as wide as the report, with the logo filling its left end (flush with the
 * band's top, bottom and left edges), then the organisation
 * (gold), title, description and run date. The band's background is an image of the gradient with the "LM" line art
 * (see bandImage.js), made at the band's size. Followed by a thin gold stripe.
 * Returns { xml, height, image } (inches; image = the background PNG in base64, to embed as BAND_IMAGE).
 */
function headerBand({ tpl, title, desc, width, nm, generated }) {
  const pad = 0.16, gap = 0.2;

  // Middle column: organisation, title, description, run date
  const lines = [];
  if (tpl.org) lines.push(styledLine(tpl, "org", { name: "OrgName", value: lit(tpl.org.toUpperCase()), h: 0.2, size: 8, bold: true, color: BRAND.gold }));
  lines.push(styledLine(tpl, "title", { name: "ReportTitle", value: lit(title || "Report"), h: 0.42, size: 20, bold: true, color: "White" }));
  if (desc) lines.push(styledLine(tpl, "desc", { name: "ReportDescription", value: lit(desc), h: 0.24, size: 9.5, color: "#CFE3D6" }));
  lines.push(styledLine(tpl, "meta", { name: "ReportMeta", value: generated, h: 0.22, size: 8.5, color: "#9CC3AC" }));
  const textH = lines.reduce((a, l) => a + l.h, 0);
  const height = Math.max(0.95, textH + pad * 2);
  const logoW = height * LOGO_SIZE.w / LOGO_SIZE.h;

  const items = [];
  if (tpl.logo) {
    items.push(`<Image Name="${nm("Logo")}"><Source>Embedded</Source><Value>${LOGO_IMAGE}</Value><Sizing>FitProportional</Sizing>` +
      `<Top>0in</Top><Left>0in</Left><Height>${inch(height)}</Height><Width>${inch(logoW)}</Width>` +
      `<Style><Border><Style>None</Style></Border></Style></Image>`);
  }
  const textX = tpl.logo ? logoW + gap : pad;
  const textW = Math.max(1.5, width - textX - pad);
  let ty = (height - textH) / 2;
  for (const l of lines) {
    items.push(textbox({ name: nm(l.name), value: l.value, size: l.size, bold: l.bold, color: l.color, pad: 1, valign: "Bottom", pos: { top: ty, left: textX, height: l.h, width: textW } }));
    ty += l.h;
  }

  const stripe = 0.05;
  const band = lookPart(tpl, "band");
  const xml =
    `<Rectangle Name="${nm("HeaderBand")}"><ReportItems>${items.join("")}</ReportItems><KeepTogether>true</KeepTogether>` +
    `<Top>0in</Top><Left>0in</Left><Height>${inch(height)}</Height><Width>${inch(width)}</Width>` +
    `<Style><Border><Style>None</Style></Border><BackgroundColor>${band.bg || BRAND.green}</BackgroundColor>` +
    `<BackgroundGradientType>LeftRight</BackgroundGradientType><BackgroundGradientEndColor>${band.bg || BRAND.greenDeep}</BackgroundGradientEndColor>` +
    `<BackgroundImage><Source>Embedded</Source><Value>${BAND_IMAGE}</Value><BackgroundRepeat>Clip</BackgroundRepeat></BackgroundImage></Style></Rectangle>` +
    `<Rectangle Name="${nm("GoldStripe")}"><Top>${inch(height)}</Top><Left>0in</Left><Height>${inch(stripe)}</Height><Width>${inch(width)}</Width>` +
    `<Style><Border><Style>None</Style></Border><BackgroundColor>${band.stripe || BRAND.gold}</BackgroundColor></Style></Rectangle>`;
  return { xml, height: height + stripe, image: bandBackgroundPng(width, height, 96, band.bg) };
}

/**
 * Builds the complete .rdl XML.
 * @param {object} a { sql, columns, effCols, tpl, title, desc, filters, colsByKey, sort, exp, slicers }
 *   slicers: from planSlicers(), the filters readers change in SSRS.
 *   paramLayout: where the user arranged them on the parameter bar ({ cols, rows, cells }, see layoutGrid).
 */
export function buildRdl({ sql, columns, effCols, tpl, title, desc, filters, colsByKey, sort, exp, slicers = [], paramLayout = {} }) {
  const v2016 = exp.schema !== "2010";
  const fieldOf = {};
  const fieldNames = new Set();
  columns.forEach((c) => { fieldOf[c.key] = rdlIdent(c.name, fieldNames); });
  const itemNames = new Set();
  const nm = (s) => rdlIdent(s, itemNames);

  const th = THEME_RDL[tpl.theme] || THEME_RDL.ledger;
  const dn = DENSITY_RDL[tpl.density] || DENSITY_RDL.normal;
  const portrait = exp.orientation === "portrait";
  const pageW = portrait ? 8.5 : 11, pageH = portrait ? 11 : 8.5, usable = pageW - 1;

  // ----- columns and widths
  const tcols = [];
  if (tpl.rowNumbers) tcols.push({ rn: true, width: 0.45 });
  effCols.forEach((c) => tcols.push({ c, width: colWidth(c) }));
  let tableW = tcols.reduce((a, t) => a + t.width, 0);
  if (tpl.layout === "fit") { const k = usable / tableW; tcols.forEach((t) => (t.width *= k)); tableW = usable; }
  // The LoanMart header band runs to the end of the table, however wide (at least 5in, for the logo and title).
  // Other styles' headings stay within one page.
  const headerW = th.band ? Math.max(tableW, 5) : Math.min(usable, Math.max(tableW, 4));
  const sectionW = Math.max(tableW, headerW);
  const footW = Math.min(usable, sectionW);

  const align = (c) => ({ left: "Left", right: "Right", center: "Center" })[alignOf(c)];
  // The template's changes to the table (tpl.look), over the style's own colours and the row height's text size
  const lh = lookPart(tpl, "head"), lr = lookPart(tpl, "rows"), lt = lookPart(tpl, "totals");
  const zebra = tpl.zebra ? `=IIF(RowNumber(Nothing) Mod 2 = 0, "${lr.zebra || th.zebra}", "White")` : null;
  const rowLine = { color: lr.line || th.rowLine || "#E6EAF0", width: "0.75pt" };
  const rowSize = lr.size ?? dn.size;

  // ----- totals
  const totals = tpl.totals
    ? Object.fromEntries(effCols.filter((c) => NUMERIC.has(c.type) && !idLike(c.name)).map((c) => [c.key, c.type === "Percentage" ? "Avg" : "Sum"]))
    : {};
  const hasTotals = Object.keys(totals).length > 0;
  const labelIdx = tcols.findIndex((t) => !t.rn && !totals[t.c.key]);
  const totalLabelAt = labelIdx >= 0 ? labelIdx : tpl.rowNumbers ? 0 : -1;

  // ----- table cells
  const headCells = tcols.map((t) => textbox({
    name: nm(t.rn ? "hdr_RowNum" : `hdr_${fieldOf[t.c.key]}`),
    value: t.rn ? "#" : lit(t.c.label),
    bold: lh.bold ?? true, size: lh.size ?? dn.size, color: lh.color || th.headColor, bg: lh.bg || th.headBg,
    bottom: th.headBorder ? { color: th.headBorder, width: "2pt" } : null,
    align: t.rn ? "Right" : align(t.c), pad: dn.pad, valign: "Bottom",
    userSort: t.rn ? null : `=Fields!${fieldOf[t.c.key]}.Value`,
  }));

  const detailCells = tcols.map((t) => {
    if (t.rn) return textbox({ name: nm("RowNum"), value: "=RowNumber(Nothing)", size: rowSize, color: "#7A859A", align: "Right", pad: dn.pad, bg: zebra, bottom: rowLine, valign: "Top" });
    const c = t.c, F = fieldOf[c.key];
    // Yes/No labels and text case follow the column's display option; numbers and dates use the format string
    const [yes, no] = c.type === "Boolean" ? booleanLabels(c) : [];
    const textCase = c.type === "Text" ? {
      upper: `UCase(Fields!${F}.Value)`, lower: `LCase(Fields!${F}.Value)`, proper: `StrConv(Fields!${F}.Value, VbStrConv.ProperCase)`,
    }[displayOf(c)] : null;
    const value = c.type === "Boolean"
      ? `=IIF(IsNothing(Fields!${F}.Value), "", IIF(CBool(Fields!${F}.Value), ${vbStr(yes)}, ${vbStr(no)}))`
      : textCase ? `=${textCase}` : `=Fields!${F}.Value`;
    // Colour and bold: the column's data type (tpl.types), then the rows' colour
    return textbox({ name: nm(`val_${F}`), value, fmt: netFormat(c, tpl), size: rowSize, color: c.color || lr.color || th.ink, bold: c.bold, align: align(c), pad: dn.pad, bg: zebra, bottom: rowLine, valign: "Top" });
  });

  const totalCells = tcols.map((t, i) => {
    const base = { size: rowSize, bold: true, color: lt.color || th.ink, pad: dn.pad, bg: lt.bg || th.totalBg || "#EEF1F6", top: { color: lt.line || th.totalLine || "#18233A", width: "1.5pt" } };
    if (!t.rn && totals[t.c.key]) {
      const F = fieldOf[t.c.key];
      return textbox({ ...base, name: nm(`tot_${F}`), value: `=${totals[t.c.key]}(Fields!${F}.Value)`, fmt: netFormat(t.c, tpl), align: align(t.c) });
    }
    return textbox({ ...base, name: nm(`tot_label_${i + 1}`), value: i === totalLabelAt ? "Total" : "", align: t.rn ? "Right" : "Left" });
  });

  const paramNames = new Set();
  const fl = buildFilters(filters, colsByKey, fieldOf, exp.filterMode, tpl, paramNames);
  const sl = slicerRdl({ slicers, colsByKey, fieldOf, tpl, used: paramNames, dataSource: DATASOURCE });

  // ----- header block above the table
  let y = 0;
  const head = [];
  let bandImage = "";
  // part: the tpl.look part the line belongs to, if the template can restyle it
  const block = (name, value, height, extra = {}, part = null) => {
    const l = part ? styledLine(tpl, part, { h: height, ...extra }) : { h: height, ...extra };
    const { h, ...style } = l;
    head.push(textbox({ name: nm(name), value, pad: 2, pos: { top: y, left: 0, height: h, width: headerW }, ...style }));
    y += h + 0.03;
  };
  // "Generated 11 Oct 2026  ·  5 columns  ·  1,234 rows", the row count worked out by SSRS over every row
  const columnsText = `${effCols.length} ${effCols.length === 1 ? "column" : "columns"}`;
  const generated = `="Generated " & Format(Globals!ExecutionTime, "${NET_DATE[tpl.dateFormat]}") & "  ·  ${columnsText}  ·  " & ` +
    `Format(CountRows("${DATASET}"), "#,0") & IIF(CountRows("${DATASET}") = 1, " row", " rows")`;
  if (th.band) {
    const band = headerBand({ tpl, title, desc, width: headerW, nm, generated });
    head.push(band.xml);
    bandImage = band.image;
    y = band.height + 0.06;
    if (fl.summary.length) block("FilterSummary", lit("Filters: " + fl.summary.join("; ")), 0.24, { size: 9, bold: true, color: BRAND.green });
    if (sl.summary) block("SlicerSummary", sl.summary, 0.24, { size: 9, color: BRAND.ink });
  } else {
    if (tpl.org) block("OrgName", lit(tpl.org), 0.25, { size: 10, bold: true, color: "#4A566E" }, "org");
    block("ReportTitle", lit(title || "Report"), 0.42, { size: 18, bold: true, color: "#18233A", left: tpl.theme === "contrast" ? { color: "#2D4FD6", width: "4pt" } : null }, "title");
    if (desc) block("ReportDescription", lit(desc), 0.26, { size: 10, color: "#4A566E" }, "desc");
    if (fl.summary.length) block("FilterSummary", lit("Filters: " + fl.summary.join("; ")), 0.24, { size: 9, color: "#2340B0" });
    if (sl.summary) block("SlicerSummary", sl.summary, 0.24, { size: 9, color: "#4A566E" });
    block("ReportMeta",
      generated,
      0.26, { size: 9, color: "#7A859A", bottom: tpl.theme === "ledger" ? { color: "#18233A", width: "2.25pt" } : null }, "meta");
  }
  y += 0.12;

  // ----- tablix
  const row = (h, cells) =>
    `<TablixRow><Height>${inch(h)}</Height><TablixCells>${cells.map((x) => `<TablixCell><CellContents>${x}</CellContents></TablixCell>`).join("")}</TablixCells></TablixRow>`;
  const sortXml = sort && fieldOf[sort.key] && colsByKey[sort.key]
    ? `<SortExpressions><SortExpression><Value>=Fields!${fieldOf[sort.key]}.Value</Value>${sort.dir === "desc" ? "<Direction>Descending</Direction>" : ""}</SortExpression></SortExpressions>`
    : "";
  const freezeFirst = tpl.layout === "expand" && tpl.stickyFirst;
  const tablixH = 0.32 + dn.h + (hasTotals ? dn.h : 0);

  const tablix = `<Tablix Name="${nm("ReportTable")}">
<TablixBody>
<TablixColumns>${tcols.map((t) => `<TablixColumn><Width>${inch(t.width)}</Width></TablixColumn>`).join("")}</TablixColumns>
<TablixRows>${row(0.32, headCells)}${row(dn.h, detailCells)}${hasTotals ? row(dn.h, totalCells) : ""}</TablixRows>
</TablixBody>
<TablixColumnHierarchy><TablixMembers>${tcols.map((_, i) => (i === 0 && freezeFirst ? "<TablixMember><FixedData>true</FixedData></TablixMember>" : "<TablixMember />")).join("")}</TablixMembers></TablixColumnHierarchy>
<TablixRowHierarchy><TablixMembers>
<TablixMember><FixedData>true</FixedData><KeepWithGroup>After</KeepWithGroup><RepeatOnNewPage>true</RepeatOnNewPage></TablixMember>
<TablixMember><Group Name="Details" />${sortXml}</TablixMember>
${hasTotals ? "<TablixMember><KeepWithGroup>Before</KeepWithGroup></TablixMember>" : ""}
</TablixMembers></TablixRowHierarchy>
<DataSetName>${DATASET}</DataSetName>
<NoRowsMessage>No rows match this report's filters.</NoRowsMessage>
<Top>${inch(y)}</Top><Left>0in</Left><Height>${inch(tablixH)}</Height><Width>${inch(tableW)}</Width>
<Style><Border><Style>None</Style></Border></Style>
</Tablix>`;
  const bodyH = y + tablixH + 0.1;

  // ----- page
  const fn = styledLine(tpl, "footer", { h: 0.22, size: 8, color: "#4A566E" });
  const footer = `<PageFooter><Height>${inch(Math.max(0.35, fn.h + 0.13))}</Height><PrintOnFirstPage>true</PrintOnFirstPage><PrintOnLastPage>true</PrintOnLastPage><ReportItems>
${tpl.footer ? textbox({ name: nm("FooterNote"), value: lit(tpl.footer), size: fn.size, color: fn.color, bold: fn.bold, pad: 2, pos: { top: 0.08, left: 0, height: fn.h, width: Math.max(footW - 1.7, 1) } }) : ""}
${textbox({ name: nm("PageNumber"), value: `="Page " & Globals!PageNumber & " of " & Globals!TotalPages`, size: 8, color: "#7A859A", align: "Right", pad: 2, pos: { top: 0.08, left: Math.max(footW - 1.6, 0), height: 0.22, width: 1.6 } })}
</ReportItems><Style><Border><Style>None</Style></Border></Style></PageFooter>`;
  const page = `<Page>${footer}<PageHeight>${inch(pageH)}</PageHeight><PageWidth>${inch(pageW)}</PageWidth><LeftMargin>0.5in</LeftMargin><RightMargin>0.5in</RightMargin><TopMargin>0.5in</TopMargin><BottomMargin>0.5in</BottomMargin><Style /></Page>`;
  const body = `<Body><ReportItems>${head.join("")}${tablix}</ReportItems><Height>${inch(bodyH)}</Height><Style /></Body>`;

  // ----- data
  // Credentials are never written into the file. With a SQL login, SSRS asks for them
  // to be stored on the report server after upload (Manage > Data sources).
  const integrated = exp.dsAuth !== "sql";
  const dataSource = exp.dsMode === "shared"
    ? `<DataSourceReference>${xesc(exp.dsRef.trim())}</DataSourceReference>`
    : `<ConnectionProperties><DataProvider>SQL</DataProvider><ConnectString>${xesc(`Data Source=${exp.server.trim()};Initial Catalog=${exp.database.trim()}`)}</ConnectString>${integrated ? "<IntegratedSecurity>true</IntegratedSecurity>" : ""}</ConnectionProperties><rd:SecurityType>${integrated ? "Integrated" : "DataBase"}</rd:SecurityType>`;
  const fieldsXml = columns.map((c) => `<Field Name="${fieldOf[c.key]}"><DataField>${xesc(c.name)}</DataField><rd:TypeName>${NET_TYPE[c.type]}</rd:TypeName></Field>`).join("\n");
  const allFilters = [...fl.filters, ...sl.filters];
  const filtersXml = allFilters.length
    ? `<Filters>${allFilters.map((f) => `<Filter><FilterExpression>${xesc(f.expr)}</FilterExpression><Operator>${f.op}</Operator><FilterValues>${f.values.map((v) => `<FilterValue>${xesc(v)}</FilterValue>`).join("")}</FilterValues></Filter>`).join("")}</Filters>`
    : "";

  // Readers' slicers first, then any of the author's filters exported as parameters.
  const params = [
    ...sl.params,
    ...fl.params.map((p) => ({ name: p.name, xml: `<ReportParameter Name="${p.name}"><DataType>${p.dataType}</DataType><DefaultValue><Values><Value>${xesc(p.def)}</Value></Values></DefaultValue>${p.dataType === "String" ? "<AllowBlank>true</AllowBlank>" : ""}<Prompt>${xesc(p.prompt)}</Prompt></ReportParameter>` })),
  ];
  const paramsXml = params.length ? `<ReportParameters>${params.map((p) => p.xml).join("")}</ReportParameters>` : "";
  // Parameter bar: the readers' slicers where the user placed them, then the author's own parameters in the rows below.
  const grid = layoutGrid(slicerItems(slicers).map((i) => i.id), paramLayout);
  const cells = [
    ...sl.params.map((p) => ({ name: p.name, r: grid.cells[p.item][0], c: grid.cells[p.item][1] })),
    ...fl.params.map((p, i) => ({ name: p.name, r: grid.rows + Math.floor(i / grid.cols), c: i % grid.cols })),
  ];
  const gridRows = grid.rows + Math.ceil(fl.params.length / grid.cols);
  const paramsLayoutXml = params.length && v2016
    ? `<ReportParametersLayout><GridLayoutDefinition><NumberOfColumns>${grid.cols}</NumberOfColumns><NumberOfRows>${gridRows}</NumberOfRows><CellDefinitions>${cells.map((x) => `<CellDefinition><ColumnIndex>${x.c}</ColumnIndex><RowIndex>${x.r}</RowIndex><ParameterName>${x.name}</ParameterName></CellDefinition>`).join("")}</CellDefinitions></GridLayoutDefinition></ReportParametersLayout>`
    : "";

  const ns = v2016
    ? "http://schemas.microsoft.com/sqlserver/reporting/2016/01/reportdefinition"
    : "http://schemas.microsoft.com/sqlserver/reporting/2010/01/reportdefinition";
  const layout = v2016
    ? `<ReportSections><ReportSection>${body}<Width>${inch(sectionW)}</Width>${page}</ReportSection></ReportSections>`
    : `${body}<Width>${inch(sectionW)}</Width>${page}`;

  return `<?xml version="1.0" encoding="utf-8"?>
<Report xmlns="${ns}" xmlns:rd="http://schemas.microsoft.com/SQLServer/reporting/reportdesigner">
<AutoRefresh>0</AutoRefresh>
<DataSources><DataSource Name="${DATASOURCE}">${dataSource}<rd:DataSourceID>${guid()}</rd:DataSourceID></DataSource></DataSources>
<DataSets><DataSet Name="${DATASET}">
<Query><DataSourceName>${DATASOURCE}</DataSourceName><CommandText>${xesc(sql.trim().replace(/;\s*$/, ""))}</CommandText></Query>
<Fields>
${fieldsXml}
</Fields>
${filtersXml}
</DataSet>${sl.datasets.join("")}</DataSets>
${layout}
${bandImage ? `<EmbeddedImages>${tpl.logo ? `<EmbeddedImage Name="${LOGO_IMAGE}"><MIMEType>image/png</MIMEType><ImageData>${LOANMART_LOGO_PNG}</ImageData></EmbeddedImage>` : ""}` +
    `<EmbeddedImage Name="${BAND_IMAGE}"><MIMEType>image/png</MIMEType><ImageData>${bandImage}</ImageData></EmbeddedImage></EmbeddedImages>` : ""}
${paramsXml}
${paramsLayoutXml}
<rd:ReportUnitType>Inch</rd:ReportUnitType>
<rd:ReportID>${guid()}</rd:ReportID>
</Report>
`;
}
