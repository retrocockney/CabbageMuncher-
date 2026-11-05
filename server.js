const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 10000;
app.use(cors({ origin: process.env.ALLOWED_ORIGIN ? process.env.ALLOWED_ORIGIN.split(",").map(v => v.trim()) : true }));
app.use(express.json({ limit: "20kb" }));
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false });

async function initialiseDatabase() {
  await pool.query(`CREATE TABLE IF NOT EXISTS cabbage_scores (
    username_key TEXT PRIMARY KEY, username TEXT NOT NULL,
    score BIGINT NOT NULL DEFAULT 0 CHECK (score >= 0),
    cpm INTEGER NOT NULL DEFAULT 0 CHECK (cpm >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}
app.get("/", (_req, res) => res.json({ name: "Cabbage Muncher Online API", status: "ok" }));
app.get("/health", (_req, res) => res.status(200).send("ok"));

app.get("/api/leaderboard", async (_req, res) => {
  try {
    const result = await pool.query("SELECT username, score, cpm FROM cabbage_scores ORDER BY score DESC, updated_at ASC LIMIT 100");
    res.json({ leaderboard: result.rows });
  } catch (error) {
    console.error("Leaderboard error:", error);
    res.status(500).json({ error: "Could not load leaderboard." });
  }
});
app.get("/api/player", async (req, res) => {
  const username = String(req.query.username || "").trim().slice(0, 16);
  if (!username) return res.status(400).json({ error: "Username is required." });
  try {
    const result = await pool.query("SELECT username, score, cpm FROM cabbage_scores WHERE username_key = $1", [username.toLowerCase()]);
    res.json(result.rows[0] || { username, score: 0, cpm: 0 });
  } catch (error) {
    console.error("Player score error:", error);
    res.status(500).json({ error: "Could not load player score." });
  }
});
app.post("/api/score", async (req, res) => {
  const username = String(req.body.username || "").trim().slice(0, 16);
  const score = Number(req.body.score);
  const cpm = Number(req.body.cpm || 0);
  if (!username) return res.status(400).json({ error: "A username is required." });
  if (!Number.isSafeInteger(score) || score < 0) return res.status(400).json({ error: "Score must be a non-negative whole number." });
  if (!Number.isFinite(cpm) || cpm < 0 || cpm > 100000) return res.status(400).json({ error: "Invalid CPM value." });
  try {
    const result = await pool.query(`INSERT INTO cabbage_scores (username_key, username, score, cpm, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (username_key) DO UPDATE SET username = EXCLUDED.username,
      score = GREATEST(cabbage_scores.score, EXCLUDED.score), cpm = EXCLUDED.cpm, updated_at = NOW()
      RETURNING username, score, cpm`, [username.toLowerCase(), username, score, Math.round(cpm)]);
    res.json({ ok: true, player: result.rows[0] });
  } catch (error) {
    console.error("Score save error:", error);
    res.status(500).json({ error: "Could not save score." });
  }
});
initialiseDatabase().then(() => app.listen(PORT, "0.0.0.0", () => console.log(`API listening on ${PORT}`)))
  .catch(error => { console.error("Database initialisation failed:", error); process.exit(1); });
