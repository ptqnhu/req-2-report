import { Router } from "express";
import { effectiveColumns, keyBy, fileSlug, cleanDateDefault, cleanPrompts } from "@req-2-report/shared";
import { buildRdl, validateExport, exportWarnings, dataSourcePath } from "../rdl/buildRdl.js";
import { planSlicers } from "../rdl/slicers.js";
import { checkReadOnly } from "../services/queryGuard.js";
import { asyncHandler } from "../lib/errors.js";
import { requireString, optionalString, normalizeColumns, sanitizeTemplate, sanitizeExport } from "../lib/validate.js";

const router = Router();

/**
 * POST /api/rdl  { sql, columns, tpl, title, desc, filters, slicers, paramLayout, sort, exp }
 *   -> { rdl, fileName, warnings, problem }
 * POST /api/rdl?download=1 -> the .rdl file as an attachment
 */
router.post("/rdl", asyncHandler(async (req, res) => {
  const b = req.body || {};
  const sql = requireString(b.sql, "sql", { allowEmpty: false });
  const columns = normalizeColumns(b.columns);
  const tpl = sanitizeTemplate(b.tpl);
  const exp = sanitizeExport(b.exp);
  const title = optionalString(b.title, "title", 300);
  const desc = optionalString(b.desc, "desc", 2000);
  const filters = Array.isArray(b.filters) ? b.filters : [];
  const slicers = (Array.isArray(b.slicers) ? b.slicers : []).slice(0, 20)
    .filter((s) => s && typeof s.col === "string" && typeof s.kind === "string")
    .map(({ col, kind, def, prompts }) => {
      const s = { col, kind };
      if (def) s.def = cleanDateDefault(def);
      const p = cleanPrompts(prompts);
      if (p) s.prompts = p;
      return s;
    });
  // Parameter bar layout: { cols, rows, cells: { item id: [row, col] } }; layoutGrid() clamps and fixes it.
  const lay = b.paramLayout && typeof b.paramLayout === "object" ? b.paramLayout : {};
  const paramLayout = {
    cols: lay.cols, rows: lay.rows,
    cells: Object.fromEntries(Object.entries(lay.cells && typeof lay.cells === "object" ? lay.cells : {}).slice(0, 200)),
  };
  const sort = b.sort && typeof b.sort.key === "string" ? { key: b.sort.key, dir: b.sort.dir === "desc" ? "desc" : "asc" } : null;

  const warnings = exportWarnings(columns);
  const effCols = effectiveColumns(columns, tpl);
  // The query runs later under the SSRS data source, so it gets the same read-only check as a preview.
  const problem = checkReadOnly(sql) || validateExport(exp) || (effCols.length ? "" : "Select at least one column to export.");
  if (problem) return res.json({ rdl: null, fileName: null, warnings, problem });

  if (exp.dsMode === "shared" && !exp.dsRef.trim()) {
    warnings.push(`No shared data source path entered, so the file points at “${dataSourcePath(exp)}”. After uploading, open the report's Manage page, choose Data sources, and pick the real one.`);
  }

  const colsByKey = keyBy(effCols);
  const plan = planSlicers(sql, columns, slicers, colsByKey);
  warnings.push(...plan.warnings);
  const rdl = buildRdl({ sql, columns, effCols, tpl, title, desc, filters, colsByKey, sort, exp, slicers: plan.slicers, paramLayout });
  const fileName = fileSlug(title) + ".rdl";

  if (req.query.download) return res.attachment(fileName).type("application/xml").send(rdl);
  res.json({ rdl, fileName, warnings, problem: "" });
}));

export default router;
