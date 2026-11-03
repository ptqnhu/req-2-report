import "./lib/loadEnv.js"; // first, so settings see the .env values
import { createApp } from "./app.js";
import { settings } from "./lib/config.js";

const server = createApp().listen(settings.port, () => {
  console.log(`LoanMart Insights API listening on http://localhost:${settings.port}`);
});

function shutdown() {
  server.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
