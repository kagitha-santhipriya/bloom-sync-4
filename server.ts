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

  app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  }));
  app.use(express.json());

  // Request logging
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // API Routes
  app.get("/api/submissions", (req, res) => {
    try {
      if (!fs.existsSync(DB_FILE)) {
        return res.json([]);
      }
      const data = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
      res.json(data.submissions || []);
    } catch (error) {
      console.error("Error reading submissions:", error);
      res.status(500).json({ error: "Failed to read database" });
    }
  });

  app.post("/api/submissions", (req, res) => {
    try {
      console.log("Received new submission request:", req.body.crop, req.body.location);
      const data = fs.existsSync(DB_FILE) 
        ? JSON.parse(fs.readFileSync(DB_FILE, "utf-8"))
        : { submissions: [] };
      
      const newSubmission = {
        ...req.body,
        id: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
        choice: null, 
      };
      
      if (!data.submissions) data.submissions = [];
      data.submissions.push(newSubmission);
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
      console.log(`Saved new submission: ${newSubmission.id}. Total submissions: ${data.submissions.length}`);
      res.status(201).json(newSubmission);
    } catch (error) {
      console.error("Error saving submission:", error);
      res.status(500).json({ error: "Failed to save submission" });
    }
  });

  app.patch("/api/submissions/:id/choice", (req, res) => {
    try {
      const { id } = req.params;
      const { choice } = req.body;
      const data = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
      const sub = data.submissions.find((s: any) => s.id === id);
      if (sub) {
        sub.choice = choice;
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        res.json(sub);
      } else {
        res.status(404).json({ error: "Submission not found" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to update choice" });
    }
  });

  app.delete("/api/submissions", (req, res) => {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify({ submissions: [] }, null, 2));
      console.log("Cleared all submissions");
      res.json({ message: "History cleared" });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear history" });
    }
  });

  app.get("/api/admin/stats", (req, res) => {
    try {
      if (!fs.existsSync(DB_FILE)) {
        return res.json({ total: 0, byRisk: {}, byChoice: {}, byCrop: {} });
      }
      const data = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
      const subs = data.submissions || [];
      
      const stats = {
        total: subs.length,
        byRisk: {
          high: subs.filter((s: any) => s.riskLevel === 'high').length,
          medium: subs.filter((s: any) => s.riskLevel === 'medium').length,
          low: subs.filter((s: any) => s.riskLevel === 'low').length,
        },
        byChoice: {
          change: subs.filter((s: any) => s.choice === 'A').length,
          continue: subs.filter((s: any) => s.choice === 'B').length,
          none: subs.filter((s: any) => !s.choice).length,
        },
        byCrop: subs.reduce((acc: any, s: any) => {
          acc[s.crop] = (acc[s.crop] || 0) + 1;
          return acc;
        }, {}),
      };
      res.json(stats);
    } catch (error) {
      console.error("Error getting stats:", error);
      res.status(500).json({ error: "Failed to get stats" });
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
