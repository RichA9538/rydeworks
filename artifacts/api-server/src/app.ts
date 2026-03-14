import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import { existsSync } from "fs";
import { connectMongoDB } from "./lib/mongoose.js";
import router from "./routes/index.js";

const app: Express = express();

// Connect to MongoDB with retry — never exit the process on connection failure
// so the HTTP healthcheck always has a chance to respond.
(function startMongo(attempt = 1) {
  connectMongoDB()
    .then(() => console.log('✅ MongoDB ready'))
    .catch((err) => {
      const delay = Math.min(5000 * attempt, 30000);
      console.error(
        `⚠️  MongoDB connection attempt ${attempt} failed: ${err.message}. Retrying in ${delay / 1000}s…`
      );
      setTimeout(() => startMongo(attempt + 1), delay);
    });
})();

const allowedOrigins = [
  'https://rydeworks.com',
  'https://www.rydeworks.com',
  'https://app.rydeworks.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:19945',
  ...(process.env.REPLIT_DOMAINS ? process.env.REPLIT_DOMAINS.split(',').map(d => `https://${d.trim()}`) : [])
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o)) || origin.includes('replit')) {
      return callback(null, true);
    }
    callback(null, true); // Allow all in development
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use("/api", router);

// Serve the built React frontend in production
if (process.env.NODE_ENV === "production") {
  // The frontend build output is at ../../rydeworks/dist/public relative to this file in dev,
  // but in production (after Railway build) we copy it adjacent to the bundle.
  const candidates = [
    path.resolve(process.cwd(), "artifacts/rydeworks/dist/public"),
    path.resolve(process.cwd(), "rydeworks/dist/public"),
    path.resolve(process.cwd(), "dist/public"),
  ];
  const staticDir = candidates.find(existsSync);

  if (staticDir) {
    app.use(express.static(staticDir));
    // For client-side routing — serve index.html for all non-API routes
    app.get("*", (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
    console.log(`Serving frontend from: ${staticDir}`);
  } else {
    console.warn("Frontend static files not found. Run the frontend build first.");
  }
}

export default app;
