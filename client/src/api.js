// Thin wrapper around the server API. Every call returns parsed JSON or throws an Error
// carrying the server's message and HTTP status.
async function request(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
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

export const api = {
  /** The databases with a schema file: { databases: [{ name, tables }] }. */
  databases: () => request("/databases"),
  /**
   * messages: [{role: "user", content} | {role: "assistant", sql, explanation}].
   * Returns { sql, explanation, columns, table }: the AI works out the columns, since the query is never run.
   */
  aiQuery: (database, messages, sql) => request("/ai/query", { method: "POST", body: { database, messages, sql } }),
  /** The columns of a query the user wrote themselves: { columns, table, note }. */
  aiColumns: (database, sql) => request("/ai/columns", { method: "POST", body: { database, sql } }),
  rdl: (payload) => request("/rdl", { method: "POST", body: payload }),
  listTemplates: () => request("/templates"),
  saveTemplate: (tpl) => request(`/templates/${encodeURIComponent(tpl.name)}`, { method: "PUT", body: tpl }),
  deleteTemplate: (name) => request(`/templates/${encodeURIComponent(name)}`, { method: "DELETE" }),
};
