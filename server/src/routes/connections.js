import { Router } from "express";
import { asyncHandler, HttpError } from "../lib/errors.js";
import { buildConfig } from "../services/db/connectionConfig.js";
import { listLocalInstances } from "../services/db/localInstances.js";
import { settings } from "../lib/config.js";
import { noActivityLog } from "../services/activityLog.js";

/** True when the browser runs on the same computer as this app (so "sign in as this computer" is the user's own account). */
const fromThisComputer = (req) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);

/**
 * Connection routes. The password is used once to open the pool and never sent back.
 * `defaultConnection` (settings.defaultConnection, from DB_* in .env) is the database pages open by themselves.
 */
export default function connectionRoutes(connections, activityLog = noActivityLog, defaultConnection = settings.defaultConnection) {
  const router = Router();

  /** Opens a pool for `input` (the connect form's fields), logging the sign-in either way. */
  async function openLogged(req, input, options) {
    const { config, summary } = buildConfig(input, options);
    const entry = { ServerName: summary.server, DatabaseName: summary.database, AuthType: summary.authType, LoginName: summary.user || null, ClientIp: req.ip };
    let opened;
    try {
      opened = await connections.open(config, summary);
    } catch (e) {
      activityLog.signIn({ ...entry, Succeeded: false, ErrorMessage: String(e.message).slice(0, 4000) });
      throw e;
    }
    const { id, info } = opened;
    activityLog.signIn({ ...entry, ConnectionId: id, LoginName: info.user || null, ServerVersion: info.version || null, Succeeded: true });
    return { connectionId: id, ...info };
  }

  /** GET /api/local-servers -> [{ server, running }] SQL Server instances on this computer, for local browsers only */
  router.get("/local-servers", asyncHandler(async (req, res) => {
    // Skip the lookup when ALLOWED_SERVERS would block localhost anyway.
    const allowed = !settings.allowedServers.length || settings.allowedServers.includes("localhost");
    res.json(allowed && fromThisComputer(req) ? await listLocalInstances() : []);
  }));

  /** POST /api/databases { server, authType, user, password, ... } -> ["Sales", ...] databases the login can open */
  router.post("/databases", asyncHandler(async (req, res) => {
    const { config } = buildConfig({ ...req.body, database: "master" }, { fromThisComputer: fromThisComputer(req) });
    res.json(await connections.listDatabases(config));
  }));

  /** POST /api/connections { server, database, authType, user, password, encrypt, trustServerCertificate } */
  router.post("/connections", asyncHandler(async (req, res) => {
    res.status(201).json(await openLogged(req, req.body, { fromThisComputer: fromThisComputer(req) }));
  }));

  /**
   * POST /api/connections/default -> a new connection to the default database; 404 when there isn't one.
   * Whoever set DB_* chose to open it for every visitor, so "local" sign-in (DB_AUTH=local) is allowed from anywhere.
   */
  router.post("/connections/default", asyncHandler(async (req, res) => {
    if (!defaultConnection) throw new HttpError(404, "No default database is set up.");
    res.status(201).json(await openLogged(req, defaultConnection, { fromThisComputer: true }));
  }));

  /** GET /api/connections/:id -> connection details (no secrets) */
  router.get("/connections/:id", asyncHandler(async (req, res) => {
    const s = connections.get(req.params.id);
    res.json({ connectionId: req.params.id, ...s.info });
  }));

  /** DELETE /api/connections/:id */
  router.delete("/connections/:id", asyncHandler(async (req, res) => {
    await connections.close(req.params.id);
    res.status(204).end();
  }));

  return router;
}
