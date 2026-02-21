import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const DB_FILE = path.resolve(process.cwd(), "db.json");

// Initialize DB if not exists
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ submissions: [] }, null, 2));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Routes
  app.get("/api/submissions", (req, res) => {
    try {
      const data = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
      res.json(data.submissions);
    } catch (error) {
      res.status(500).json({ error: "Failed to read database" });
    }
  });

  app.post("/api/submissions", (req, res) => {
    try {
      const data = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
      const newSubmission = {
        ...req.body,
        id: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
      };
      data.submissions.push(newSubmission);
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
      res.status(201).json(newSubmission);
    } catch (error) {
      res.status(500).json({ error: "Failed to save submission" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.resolve(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
