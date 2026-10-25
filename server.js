// Browsers can't set Cookie headers cross-origin, so the cast/reel loop runs here.
// Every browser gets its own bot (cookies, loop, stats), keyed by the X-Bot-Id header.
import express from "express";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = "https://lfdiego.xyz";
// On Railway, point STATS_FILE into a mounted volume (e.g. /data/stats.json) so stats survive deploys.
const STATS_FILE = process.env.STATS_FILE || new URL("./stats.json", import.meta.url);
// city -> fishing spot sent with every cast
const CITIES = {
  neustadt: "ns-fluss",
  seeburg: "sb-steg",
  bergheim: "bh-ache-ost",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

const emptyStats = () => ({ farmedMs: 0, caught: 0, escaped: 0, money: 0, balance: null, species: {}, recent: [] });

// { [botId]: stats }
let saved = {};
try { saved = JSON.parse(fs.readFileSync(STATS_FILE, "utf8")); } catch {}
if (!saved || typeof saved !== "object" || "caught" in saved) saved = {}; // old single-user format

let saveTimer = null;
const flushStats = () => {
  saveTimer = null;
  for (const [id, bot] of bots) {
    const { farmedMs, caught, escaped, money, balance, species, recent, turbo, city } = bot.state;
    saved[id] = { farmedMs, caught, escaped, money, balance, species, recent, turbo, city };
  }
  fs.writeFile(STATS_FILE, JSON.stringify(saved, null, 2), () => {});
};
// The farm tick and every catch both want to save; a synchronous write in the
// middle of the cast/reel loop is dead time, so coalesce them into one async write.
const saveStats = () => { saveTimer ??= setTimeout(flushStats, 1000); };

// phase: idle | waiting | reeling | caught | escaped — drives the 3D scene
const bots = new Map();
function getBot(id) {
  let bot = bots.get(id);
  if (!bot) {
    bot = {
      cookie: "",
      cf: "",
      extra: [], // [{ hub, cookie, active, info }] — more logins, each fishing on its own
      state: {
        running: false, phase: "idle", cast: null, lastCatch: null, lastEscape: null, error: "",
        turbo: false, city: "neustadt", probe: freshProbe(), sessions: [], ...emptyStats(), ...saved[id],
      },
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

// DEBUG=1 logs every API request and reply with timing.
const DEBUG = !!process.env.DEBUG;
async function post(bot, path, body) {
  const t0 = Date.now();
  if (DEBUG) console.log(`[debug] -> ${path} ${JSON.stringify(body)}`);
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
      Cookie: bot.cookie,
      // The game rejects requests that don't look like they came from its own page.
      Origin: BASE,
      Referer: BASE + "/hub/",
      Accept: "*/*",
      "Accept-Language": "de-DE,de;q=0.9",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Dest": "empty",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  if (DEBUG) console.log(`[debug] <- ${path} ${res.status} ${Date.now() - t0}ms ${text}`);
  if (res.status === 401 || res.status === 403) {
    const cloudflare = /cloudflare|just a moment|cf-chl/i.test(text) || res.headers.has("cf-mitigated");
    // Only new cookies fix this, so it is the one error that ends the loop.
    throw Object.assign(
      new Error(`Cookies abgelaufen oder ungültig (HTTP ${res.status}${cloudflare ? ", Cloudflare-Block" : ""}): ${text.slice(0, 120).replace(/\s+/g, " ")}`),
      { fatal: true },
    );
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { throw new Error(`Keine JSON-Antwort: ${text.slice(0, 200)}`); }
}

// Reeling has to land after the server's own biteInMs + reelMinMs timers. The reel
// request still needs to fly there, so that flight time is the real safety margin
// and the local pad can stay small.
const REEL_PAD_MS = 250;
const REEL_SCORE = 0.9676756468100209;
// A blip (timeout, 5xx, a stray HTML error page) used to end the run and drop the
// catch rate to zero until someone clicked Auswerfen again. Ride them out instead.
const MAX_FAILS = 8;

// Neither endpoint is documented and we only read three fields of the cast reply,
// so report any field we ignore — once per name. A reel window we never knew about
// would show up here rather than as a silent escape.
const CAST_KNOWN = new Set(["castId", "biteInMs", "reelMinMs"]);
// The fish has to be hooked with a press after it bites; `ms` is the time since
// the cast. Press a bit after the bite so it can't land early.
const PRESS_PAD_MS = 150;
const PRESSES = 3;
const PRESS_GAP_MS = 250;
// Fitted from logged rounds: the marker is a triangle wave 0→1→0 that starts at
// game.phase on the bite and gets faster with difficulty. Difficulty 1 fits within
// ~0.01 score; higher difficulties are extrapolated from fewer rounds.
const MARKER_PERIOD_MS = 4080;
const MARKER_SPEEDUP = 0.3;
const MARKER_OFFSET_MS = 50;
// Earliest ms ≥ minMs at which the marker is within `tol` of `center` (0 = dead on).
function aimMs(cast, center, minMs, tol = 0) {
  const period = MARKER_PERIOD_MS / (1 + MARKER_SPEEDUP * ((cast.difficulty ?? 1) - 1));
  const start = cast.biteInMs - MARKER_OFFSET_MS;
  const x0 = cast.game.phase + (minMs - start) / period;
  const c = Math.min(1, Math.max(0, center));
  // Within one cycle the marker rises as 2f and falls as 2-2f, so it is near the
  // target in one span on the way up and one on the way down.
  const lo = Math.max(0, c - tol) / 2, hi = Math.min(1, c + tol) / 2;
  let best = Infinity;
  for (const [from, to] of [[lo, hi], [1 - hi, 1 - lo]])
    for (let k = Math.floor(x0) - 1; k <= Math.floor(x0) + 1; k++) {
      if (x0 >= k + from && x0 <= k + to) best = Math.min(best, x0);
      else if (k + from >= x0) best = Math.min(best, k + from);
    }
  return Math.round(start + (best - cast.game.phase) * period);
}

// Turbo takes every shortcut the server turned out to allow. None of them are
// documented, so each one is probed on the live run and dropped for the rest of
// the run the moment it costs a fish. (Parallel casts are out: the server allows
// one fishing session per login — extra logins below do that instead.)
// - ahead: all three presses sent right after the bite, with their future `ms`,
//   instead of waiting for each — only works if the server trusts our `ms`
// - earlyRetry: reel with almost no pad and simply reel again if it was early
const TURBO_REEL_PAD_MS = 30;
const EARLY_RETRY_MS = 80;
const freshProbe = () => ({ ahead: null, earlyRetry: null });
const say = (msg) => console.log(`[turbo] ${msg}`);

const reported = new Set();
function reportShape(what, o, known) {
  if (DEBUG) return; // the full reply is already logged
  for (const [k, val] of Object.entries(o || {})) {
    if (known.has(k) || reported.has(what + k)) continue;
    reported.add(what + k);
    console.log(`[${what}] ungenutztes Feld: ${k} = ${JSON.stringify(val)?.slice(0, 160)}`);
  }
}

// The server allows one fishing session per login, so fishing in parallel means
// one loop per login. The main login (sess === bot) drives the scene and its
// failure stops everything; an extra login that fails just drops out.
async function loop(bot, sess = bot) {
  const state = bot.state;
  const probe = state.probe;
  const main = sess === bot;
  const alive = () => state.running && (main || sess.active);
  let fails = 0;
  while (alive()) {
    try {
      const turbo = state.turbo;
      const sentAt = Date.now();
      const elapsed = () => Date.now() - sentAt;
      const stats = await post(sess, "/hub/api/games/fishing/cast", { city: state.city, spot: CITIES[state.city] });
      if (!stats.castId) throw new Error(`Kein castId in ${JSON.stringify(stats)}`);
      reportShape("cast", stats, CAST_KNOWN);
      const biteInMs = stats.biteInMs ?? 0;
      const pad = turbo && probe.earlyRetry !== false ? TURBO_REEL_PAD_MS : REEL_PAD_MS;
      const waitMs = biteInMs + (stats.reelMinMs ?? 3000) + pad;
      if (main) {
        state.phase = "waiting";
        state.cast = { at: sentAt, biteInMs, waitMs };
      }
      if (DEBUG) console.log(`[debug] cast ${stats.castId}: Biss ${biteInMs}ms, reel bei ${waitMs}ms`);
      // The server started its timers while handling the cast, so the round-trip we
      // just paid is already part of the wait — sleeping the full span waits twice.
      // Three presses, each aimed at the moment the marker crosses its target.
      let pressed = {};
      const presses = [];
      let center = stats.game?.center;
      let minMs = biteInMs + PRESS_PAD_MS;
      for (let i = 0; i < PRESSES && state.running; i++) {
        const ms = center == null ? minMs : aimMs(stats, center, minMs);
        const ahead = turbo && probe.ahead !== false;
        await sleep((ahead ? biteInMs + PRESS_PAD_MS : ms) - elapsed());
        try {
          pressed = await post(sess, "/hub/api/games/fishing/press", { castId: stats.castId, ms });
        } catch (e) {
          if (!ahead || e.fatal) throw e;
          probe.ahead = false;
          say(`Presses vorab abgelehnt (${e.message}), ab jetzt mit echter Wartezeit`);
          throw e;
        }
        if (ahead && center != null && probe.ahead === null) {
          probe.ahead = pressed.score >= 0.7;
          say(probe.ahead
            ? `Presses vorab klappen (score ${pressed.score?.toFixed(3)})`
            : `Server misst press-Zeit selbst (score ${pressed.score}), ab jetzt mit echter Wartezeit`);
        }
        reportShape("press", pressed, new Set());
        presses.push({ ms, ...pressed });
        if (DEBUG) console.log(`[debug] press ${i + 1}: ms ${ms}, Ziel ${center}, score ${pressed.score}`);
        center = pressed.center;
        minMs = ms + PRESS_GAP_MS;
      }
      await sleep(waitMs - elapsed());
      if (!state.running) break;
      if (main) state.phase = "reeling";
      const reel = () => post(sess, "/hub/api/games/fishing/reel", { castId: stats.castId, score: pressed.score ?? REEL_SCORE });
      let result = await reel();
      for (let tries = 0; result.reason === "early" && turbo && probe.earlyRetry !== false && tries < 4; tries++) {
        await sleep(EARLY_RETRY_MS);
        try {
          result = await reel();
        } catch (e) {
          probe.earlyRetry = false;
          say(`Zu frühes Einholen kostet den Fisch (${e.message}), Puffer zurück auf ${REEL_PAD_MS}ms`);
          throw e;
        }
        if (result.reason !== "early" && probe.earlyRetry === null) {
          probe.earlyRetry = result.caught === true;
          say(probe.earlyRetry
            ? "Nach zu frühem Einholen nochmal einholen klappt"
            : `Zu frühes Einholen kostet den Fisch (${result.reason}), Puffer zurück auf ${REEL_PAD_MS}ms`);
        }
      }
      // One line per round, so the press timing can be fitted against the score later.
      if (DEBUG) fs.appendFile("rounds.jsonl", JSON.stringify({ cast: stats, presses, reel: result, turbo }) + "\n", () => {});
      fails = 0;
      if (main) state.error = "";
      else sess.info.error = "";
      // An escaped fish is just bad luck: count it, let the scene play it, keep fishing.
      if (result.caught === false && result.reason === "escaped") {
        state.escaped++;
        state.lastEscape = { at: Date.now() };
        if (main) state.phase = "escaped";
        if (DEBUG) console.log(`[debug] cast ${stats.castId}: entwischt`);
        // Every fish escaping means the reel is wrong, not unlucky — show the reply.
        if (state.caught === 0 && state.escaped % 5 === 0)
          console.log(`[reel] ${state.escaped}× entwischt, 0 gefangen. Antwort: ${JSON.stringify(result)}`);
        saveStats();
        continue;
      }
      if (result.success === false || result.caught === false || "error" in result)
        throw new Error(`Nicht gefangen: ${JSON.stringify(result)}`);
      reportShape("reel", result, new Set());
      record(state, readCatch(result));
      if (!main) sess.info.caught++;
      if (main) state.phase = "caught";
      if (DEBUG) console.log(`[debug] cast ${stats.castId}: gefangen`);
    } catch (e) {
      if (DEBUG) console.log(`[debug] ${main ? "" : "Session " + sess.info.n + ": "}Fehler: ${e.stack || e.message}`);
      if (e.fatal || ++fails >= MAX_FAILS) {
        if (main) state.error = e.message;
        else sess.info.error = e.message;
        console.log(`[loop] ${main ? "" : "Session " + sess.info.n + " "}gestoppt: ${e.message}`);
        break;
      }
      if (!main) { sess.info.error = `${e.message} (Versuch ${fails}/${MAX_FAILS})`; }
      else {
        state.error = `${e.message} (Versuch ${fails}/${MAX_FAILS})`;
        state.phase = "idle";
        state.cast = null;
      }
      await sleep(Math.min(400 * 2 ** (fails - 1), 8000));
    }
  }
  if (main) {
    state.running = false;
    state.phase = "idle";
    state.cast = null;
  } else {
    sess.running = false;
    sess.info.running = false;
  }
}

// Takes the extra logins from the settings: keeps the ones still listed, lets
// removed ones finish their fish and stop, and starts any new ones if running.
const EXTRA_STAGGER_MS = 700;
function setExtra(bot, hubs) {
  const want = [...new Set(hubs.map((h) => String(h).trim()).filter(Boolean))];
  for (const e of bot.extra) e.active = want.includes(e.hub);
  bot.extra = bot.extra.filter((e) => e.active || e.running);
  for (const hub of want) {
    if (bot.extra.some((e) => e.hub === hub)) continue;
    bot.extra.push({ hub, active: true, running: false, info: { n: 0, caught: 0, error: "", running: false } });
  }
  for (const e of bot.extra) e.cookie = `hub_session=${e.hub}; cf_clearance=${bot.cf}`;
  bot.extra.filter((e) => e.active).forEach((e, i) => { e.info.n = i + 2; });
  bot.state.sessions = bot.extra.filter((e) => e.active).map((e) => e.info);
  if (bot.state.running) startExtra(bot);
}
function startExtra(bot) {
  bot.extra.filter((e) => e.active && !e.running).forEach((e, i) => {
    e.running = true;
    e.info.running = true;
    e.info.error = "";
    sleep((i + 1) * EXTRA_STAGGER_MS).then(() => loop(bot, e));
  });
}

// Count the wall clock, not the ticks: a blocked or throttled interval would
// otherwise make the farm time (and the catch rate derived from it) drift.
let tickedAt = Date.now();
setInterval(() => {
  const now = Date.now();
  const elapsed = now - tickedAt;
  tickedAt = now;
  let any = false;
  for (const { state } of bots.values()) {
    if (!state.running) continue;
    state.farmedMs += elapsed;
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
  const { hubSession, cfClearance, extra } = req.body;
  if (!hubSession || !cfClearance) return res.status(400).json({ error: "Beide Cookies werden gebraucht" });
  // Always take the cookies just entered, even mid-run, so the next request uses them.
  bot.cookie = `hub_session=${hubSession}; cf_clearance=${cfClearance}`;
  bot.cf = cfClearance;
  if (Array.isArray(extra)) setExtra(bot, extra);
  if (bot.state.running) return res.json(bot.state);
  bot.state.running = true;
  bot.state.error = "";
  bot.state.probe = freshProbe();
  loop(bot);
  startExtra(bot);
  res.json(bot.state);
});

app.post("/api/settings", (req, res) => {
  const bot = req.bot;
  if (typeof req.body.turbo === "boolean") bot.state.turbo = req.body.turbo;
  if (Object.hasOwn(CITIES, String(req.body.city))) bot.state.city = req.body.city;
  if (Array.isArray(req.body.extra)) setExtra(bot, req.body.extra);
  saveStats();
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
