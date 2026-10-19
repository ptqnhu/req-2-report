import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import connectionRoutes from "./routes/connections.js";
import queryRoutes from "./routes/query.js";
import templateRoutes from "./routes/templates.js";
import rdlRoutes from "./routes/rdl.js";
import exportRoutes from "./routes/export.js";
import aiRoutes from "./routes/ai.js";
import { errorHandler, notFound } from "./lib/errors.js";
import { noActivityLog } from "./services/activityLog.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, "../../client/dist");

/** @param {{connections: ReturnType<import("./services/db/connectionManager.js").createConnectionManager>, activityLog?: object, defaultConnection?: object | null}} deps */
export function createApp({ connections, activityLog = noActivityLog, defaultConnection }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: process.env.CLIENT_ORIGIN || true }));
  app.use(express.json({ limit: process.env.BODY_LIMIT || "2mb" }));

  app.get("/api/health", (req, res) => res.json({ ok: true, connections: connections.size() }));
  app.use("/api", connectionRoutes(connections, activityLog, defaultConnection));
  app.use("/api", queryRoutes(connections));
  app.use("/api", templateRoutes);
  app.use("/api", rdlRoutes);
  app.use("/api", exportRoutes(connections));
  app.use("/api", aiRoutes(connections, activityLog));
  app.use("/api", notFound);

  // In production, serve the built client from the same origin.
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(clientDist, "index.html")));
  }

  app.use(errorHandler);
  return app;
}
