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
