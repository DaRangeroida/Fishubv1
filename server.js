// Browsers can't set Cookie headers cross-origin, so the cast/reel loop runs here.
// Every browser gets its own bot (cookies, loop, stats), keyed by the X-Bot-Id header.
import express from "express";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = "https://lfdiego.xyz";
// On Railway, point STATS_FILE into a mounted volume (e.g. /data/stats.json) so stats survive deploys.
const STATS_FILE = process.env.STATS_FILE || new URL("./stats.json", import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const emptyStats = () => ({ farmedMs: 0, caught: 0, escaped: 0, money: 0, balance: null, species: {}, recent: [] });

// { [botId]: stats }
let saved = {};
try { saved = JSON.parse(fs.readFileSync(STATS_FILE, "utf8")); } catch {}
if (!saved || typeof saved !== "object" || "caught" in saved) saved = {}; // old single-user format

const saveStats = () => {
  for (const [id, bot] of bots) {
    const { farmedMs, caught, escaped, money, balance, species, recent } = bot.state;
    saved[id] = { farmedMs, caught, escaped, money, balance, species, recent };
  }
  fs.writeFileSync(STATS_FILE, JSON.stringify(saved, null, 2));
};

// phase: idle | waiting | reeling | caught | escaped — drives the 3D scene
const bots = new Map();
function getBot(id) {
  let bot = bots.get(id);
  if (!bot) {
    bot = {
      cookie: "",
      state: { running: false, phase: "idle", cast: null, lastCatch: null, lastEscape: null, error: "", ...emptyStats(), ...saved[id] },
    };
    bots.set(id, bot);
  }
  return bot;
}

// The reel response shape isn't documented, so try the usual field names.
const pick = (o, keys) => {
  if (!o || typeof o !== "object") return undefined;
  for (const k of keys) if (o[k] != null && o[k] !== "") return o[k];
};
const num = (v) => (v == null || v === "" || !isFinite(Number(v)) ? null : Number(v));

function readCatch(r) {
  const f = [r.fish, r.catch, r.item, r.loot, r.result, r.data]
    .find((v) => v && typeof v === "object" && !Array.isArray(v)) || r;
  let name = pick(f, ["name", "displayName", "fishName", "species", "type", "title", "label", "id"])
    ?? pick(r, ["fishName", "name", "species"]) ?? (typeof r.fish === "string" ? r.fish : null) ?? "Unbekannter Fisch";
  if (typeof name === "object") name = pick(name, ["name", "de", "en"]) ?? JSON.stringify(name);
  let rarity = pick(f, ["rarity", "tier", "quality", "grade", "rarityName"]) ?? pick(r, ["rarity", "tier"]);
  if (rarity && typeof rarity === "object") rarity = pick(rarity, ["name", "id"]);
  return {
    name: String(name),
    rarity: rarity == null ? null : String(rarity),
    emoji: pick(f, ["emoji", "icon"]) ?? null,
    weight: r.sizeG != null ? num(r.sizeG) / 1000 : num(pick(f, ["weight", "weightKg", "kg", "gewicht"]) ?? pick(r, ["weight"])),
    net: num(r.net),
    cents: num(r.cents),
    newRecord: !!r.newRecord,
    firstCatch: !!r.firstCatch,
    hotspot: !!r.hotspot,
    drop: r.drop ?? null,
    length: num(pick(f, ["length", "size", "lengthCm", "cm"]) ?? pick(r, ["length", "size"])),
    value: num(pick(f, ["value", "price", "sellPrice", "coins", "money", "worth"])
      ?? pick(r, ["value", "price", "coins", "money", "reward", "earned", "payout"])) ?? 0,
    xp: num(pick(f, ["xp", "exp"]) ?? pick(r, ["xp", "exp", "xpGained"])),
    balance: num(pick(r, ["balance", "newBalance", "totalCoins", "wallet", "coinsTotal"])),
  };
}

function record(state, c) {
  const s = (state.species[c.name] ??= { count: 0, value: 0, best: null, rarity: c.rarity, emoji: c.emoji });
  s.count++;
  s.value += c.value;
  if (c.weight != null && (s.best == null || c.weight > s.best)) s.best = c.weight;
  s.rarity = c.rarity ?? s.rarity;
  s.emoji = c.emoji ?? s.emoji;
  state.caught++;
  state.money += c.value;
  if (c.balance != null) state.balance = c.balance;
  state.lastCatch = { ...c, at: Date.now() };
  state.recent = [state.lastCatch, ...state.recent].slice(0, 20);
  saveStats();
}

async function post(bot, path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "LocalDevTest/1.0", Cookie: bot.cookie },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  if (res.status === 401 || res.status === 403) throw new Error("Cookies abgelaufen oder ungültig");
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { throw new Error(`Keine JSON-Antwort: ${text.slice(0, 200)}`); }
}

async function loop(bot) {
  const state = bot.state;
  try {
    while (state.running) {
      const stats = await post(bot, "/hub/api/games/fishing/cast", { city: "neustadt", spot: "ns-fluss" });
      if (!stats.castId) throw new Error(`Kein castId in ${JSON.stringify(stats)}`);
      const biteInMs = stats.biteInMs ?? 0;
      const waitMs = biteInMs + (stats.reelMinMs ?? 3000) + 300;
      state.phase = "waiting";
      state.cast = { at: Date.now(), biteInMs, waitMs };
      await sleep(waitMs);
      if (!state.running) break;
      state.phase = "reeling";
      const result = await post(bot, "/hub/api/games/fishing/reel", { castId: stats.castId, score: 0.9676756468100209 });
      // An escaped fish is just bad luck: count it, let the scene play it, keep fishing.
      if (result.caught === false && result.reason === "escaped") {
        state.escaped++;
        state.lastEscape = { at: Date.now() };
        state.phase = "escaped";
        saveStats();
        await sleep(2600);
        continue;
      }
      if (result.success === false || result.caught === false || "error" in result)
        throw new Error(`Nicht gefangen: ${JSON.stringify(result)}`);
      record(state, readCatch(result));
      state.phase = "caught";
      await sleep(2200);
    }
  } catch (e) {
    state.error = e.message;
  }
  state.running = false;
  state.phase = "idle";
  state.cast = null;
}

setInterval(() => {
  let any = false;
  for (const { state } of bots.values()) {
    if (!state.running) continue;
    state.farmedMs += 1000;
    any = true;
  }
  if (any) saveStats();
}, 1000);

const app = express();
app.use(express.json());

// Every /api call must name its bot; the id is a random UUID the browser made.
app.use("/api", (req, res, next) => {
  const id = req.get("X-Bot-Id");
  if (!/^[0-9a-f-]{36}$/i.test(id || "")) return res.status(400).json({ error: "Keine gültige Bot-ID" });
  req.bot = getBot(id);
  next();
});

app.get("/api/status", (req, res) => res.json(req.bot.state));

app.post("/api/start", (req, res) => {
  const bot = req.bot;
  const { hubSession, cfClearance } = req.body;
  if (!hubSession || !cfClearance) return res.status(400).json({ error: "Beide Cookies werden gebraucht" });
  // Always take the cookies just entered, even mid-run, so the next request uses them.
  bot.cookie = `hub_session=${hubSession}; cf_clearance=${cfClearance}`;
  if (bot.state.running) return res.json(bot.state);
  bot.state.running = true;
  bot.state.error = "";
  loop(bot);
  res.json(bot.state);
});

app.post("/api/stop", (req, res) => {
  req.bot.state.running = false;
  res.json(req.bot.state);
});

app.post("/api/reset", (req, res) => {
  Object.assign(req.bot.state, emptyStats(), { lastCatch: null, lastEscape: null });
  saveStats();
  res.json(req.bot.state);
});

// In production the built frontend is served from here; in dev Vite serves it and proxies /api.
app.use(express.static(fileURLToPath(new URL("./dist", import.meta.url))));

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Listening on :${port}`));
