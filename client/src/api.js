// Thin wrapper around the server API. Every call returns parsed JSON or throws an Error
// carrying the server's message and HTTP status (410 means the database connection expired).
async function request(path, { method = "GET", body, keepalive } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      keepalive,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error("Can't reach the app's server. Check that it's running."), { status: 0 });
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status}).`), { status: res.status });
  return data;
}

/** POST /api/export: the whole query as a CSV or Excel file. Returns { blob, fileName, rows, truncated }. */
async function exportFile(body) {
  let res;
  try {
    res = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw Object.assign(new Error("Can't reach the app's server. Check that it's running."), { status: 0 });
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw Object.assign(new Error(data.error || `Export failed (${res.status}).`), { status: res.status });
  }
  const name = (res.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/);
  return {
    blob: await res.blob(),
    fileName: name ? name[1] : `report.${body.format}`,
    rows: Number(res.headers.get("X-Export-Rows")) || 0,
    truncated: res.headers.get("X-Export-Truncated") === "1",
  };
}

export const api = {
  localServers: () => request("/local-servers"),
  listDatabases: (details) => request("/databases", { method: "POST", body: details }),
  connect: (details) => request("/connections", { method: "POST", body: details }),
  /** Opens the database set up on the server (DB_* in .env); fails with status 404 when there isn't one. */
  connectDefault: () => request("/connections/default", { method: "POST" }),
  disconnect: (id, { keepalive = false } = {}) => request(`/connections/${encodeURIComponent(id)}`, { method: "DELETE", keepalive }),
  analyze: (connectionId, sql) => request("/analyze", { method: "POST", body: { connectionId, sql } }),
  /** all: every row (up to a safety ceiling, for charts) rather than the table preview's first few. */
  preview: (connectionId, sql, { all = false } = {}) => request("/preview", { method: "POST", body: { connectionId, sql, all } }),
  count: (connectionId, sql) => request("/count", { method: "POST", body: { connectionId, sql } }),
  /**
   * messages: [{role: "user", content} | {role: "assistant", sql, explanation}]. Returns { sql, explanation }.
   * purpose "charts" asks for a summarised query that charts well.
   */
  aiQuery: (connectionId, messages, sql, purpose) => request("/ai/query", { method: "POST", body: { connectionId, messages, sql, purpose } }),
  rdl: (payload) => request("/rdl", { method: "POST", body: payload }),
  exportFile,
  listTemplates: () => request("/templates"),
  saveTemplate: (tpl) => request(`/templates/${encodeURIComponent(tpl.name)}`, { method: "PUT", body: tpl }),
  deleteTemplate: (name) => request(`/templates/${encodeURIComponent(name)}`, { method: "DELETE" }),
};
