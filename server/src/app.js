import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import templateRoutes from "./routes/templates.js";
import rdlRoutes from "./routes/rdl.js";
import aiRoutes from "./routes/ai.js";
import { errorHandler, notFound } from "./lib/errors.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, "../../client/dist");

/** The API never connects to a database: queries are written from the schema files and run later by SSRS. */
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  // The UI calls /api on its own origin (Vite proxies it in development), so other sites get no CORS access
  // unless CLIENT_ORIGIN names them.
  app.use(cors({ origin: process.env.CLIENT_ORIGIN || false }));
  app.use(express.json({ limit: process.env.BODY_LIMIT || "2mb" }));

  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.use("/api", templateRoutes);
  app.use("/api", rdlRoutes);
  app.use("/api", aiRoutes());
  app.use("/api", notFound);

  // In production, serve the built client from the same origin.
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(clientDist, "index.html")));
  }

  app.use(errorHandler);
  return app;
}
