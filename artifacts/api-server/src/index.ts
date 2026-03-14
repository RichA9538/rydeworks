// Prevent uncaught exceptions from killing the process so the HTTP server
// (and healthcheck) always remain available even during partial failures.
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err.message, err.stack);
});

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled rejection:", reason);
});

import app from "./app";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

console.log(`[startup] NODE_ENV=${process.env.NODE_ENV} PORT=${port}`);

app.listen(port, "0.0.0.0", () => {
  console.log(`[startup] Server listening on 0.0.0.0:${port}`);
});
