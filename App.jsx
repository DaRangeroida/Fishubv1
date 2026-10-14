import { useEffect, useRef, useState } from "react";
import { createScene } from "./scene.js";
import { fishColor, prettyName, rarityColor } from "./fish.js";

// Each browser gets its own bot on the server, identified by this id.
const botId = localStorage.botId ||= crypto.randomUUID();

const api = (path, body) =>
  fetch(`/api/${path}`, {
    headers: { "Content-Type": "application/json", "X-Bot-Id": botId },
    ...(body && { method: "POST", body: JSON.stringify(body) }),
  }).then((r) => r.json());

const fmt = (n, d = 0) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: d }).format(n);
const duration = (ms) => {
  const s = Math.floor(ms / 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  return h ? `${h}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`;
};
const usd = (cents) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);

function phaseLabel(s) {
  if (!s.running) return "Pause am Teich";
  if (s.phase === "caught") return "Gefangen!";
  if (s.phase === "escaped") return "Entwischt!";
  if (!s.cast) return "Wirft aus";
  const el = Date.now() - s.cast.at;
  if (el < 1100) return "Wirft aus";
  if (el < s.cast.biteInMs) return "Wartet auf einen Biss";
  return "Drillt den Fisch";
}

function Scene({ state }) {
  const canvas = useRef(null);
  const scene = useRef(null);
  useEffect(() => {
    scene.current = createScene(canvas.current);
    return () => scene.current.dispose();
  }, []);
  useEffect(() => { if (state.loaded) scene.current?.update(state); }, [state]);
  return <canvas ref={canvas} className="scene" aria-hidden="true" />;
}

function Totals({ state }) {
  return (
    <section className="catches" aria-label="Fänge">
      <div className="totals">
        <div>
          <strong>{fmt(state.caught)}</strong>
          <span>{state.caught === 1 ? "Fisch" : "Fische"}</span>
        </div>
        <div>
          <strong>{duration(state.farmedMs || 0)}</strong>
          <span>gefarmt</span>
        </div>
        <div>
          <strong>{usd(state.money)} $</strong>
          <span>verdient</span>
        </div>
        {state.balance != null && (
          <div>
            <strong>{usd(state.balance)} $</strong>
            <span>Kontostand</span>
          </div>
        )}
      </div>
    </section>
  );
}

function FishMenu({ state }) {
  const species = Object.entries(state.species || {}).sort((a, b) => b[1].count - a[1].count);
  const max = species[0]?.[1].count || 1;
  const last = state.lastCatch;

  return (
    <div className="left">
      {last && (
        <p className="last" key={last.at}>
          Zuletzt: <b>{prettyName(last.name)}</b>
          {last.weight != null && <>, {fmt(last.weight, 2)} kg</>}
          {last.length != null && <>, {fmt(last.length, 1)} cm</>}
          {last.value > 0 && <>, +{usd(last.value)} $</>}
          {last.xp != null && <>, +{fmt(last.xp)} XP</>}
        </p>
      )}
      <aside className="menu" aria-label="Gefangene Fische">
      <h2>Fische <span>{species.length} {species.length === 1 ? "Art" : "Arten"}</span></h2>
      {species.length === 0
        ? <p className="empty">Noch nichts gefangen.</p>
        : (
          <ul className="species">
            {species.map(([name, s]) => (
              <li key={name}>
                <i style={{ background: fishColor(name) }}>{s.emoji}</i>
                <span className="name">
                  {prettyName(name)}
                  {s.rarity && <em style={{ color: rarityColor(s.rarity) }}>{s.rarity}</em>}
                </span>
                <span className="count">{fmt(s.count)}×</span>
                <span className="bar"><b style={{ width: `${(s.count / max) * 100}%`, background: fishColor(name) }} /></span>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function CookieSheet({ onStart, onClose, error, canClose }) {
  const [hub, setHub] = useState(localStorage.hubSession || "");
  const [cf, setCf] = useState(localStorage.cfClearance || "");
  return (
    <div className="sheet-backdrop">
      <form className="sheet" onSubmit={(e) => { e.preventDefault(); onStart(hub.trim(), cf.trim()); }}>
        <h2>Einloggen</h2>
        <p>Kopier die zwei Cookies aus deinem Browser, wenn du auf lfdiego.xyz eingeloggt bist. Sie werden nur auf diesem Gerät gespeichert.</p>
        <label>
          <span>hub_session</span>
          <input type="password" value={hub} onChange={(e) => setHub(e.target.value)} autoComplete="off" autoFocus />
        </label>
        <label>
          <span>cf_clearance</span>
          <input type="password" value={cf} onChange={(e) => setCf(e.target.value)} autoComplete="off" />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="sheet-actions">
          <button type="submit" className="cast" disabled={!hub || !cf}>Speichern und auswerfen</button>
          {canClose && <button type="button" className="ghost" onClick={onClose}>Abbrechen</button>}
        </div>
      </form>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState({ loaded: false, running: false, caught: 0, money: 0, species: {}, recent: [] });
  const [sheet, setSheet] = useState(!(localStorage.hubSession && localStorage.cfClearance));
  const [error, setError] = useState("");

  useEffect(() => {
    const tick = () => api("status").then((s) => setState({ ...s, loaded: true })).catch(() => {});
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, []);

  // Bot stopped on its own: bring the cookie sheet back if the cookies stopped working.
  useEffect(() => {
    if (!state.error) return;
    setError(state.error);
    if (/cookie|401|403/i.test(state.error)) setSheet(true);
  }, [state.error]);

  const start = async (hubSession = localStorage.hubSession, cfClearance = localStorage.cfClearance) => {
    localStorage.hubSession = hubSession;
    localStorage.cfClearance = cfClearance;
    const res = await api("start", { hubSession, cfClearance });
    if (res.error) return setError(res.error);
    setError("");
    setSheet(false);
    setState({ ...res, loaded: true });
  };

  const reset = () => {
    if (confirm("Alle Fänge und Statistiken löschen?")) api("reset", {}).then((s) => setState({ ...s, loaded: true }));
  };

  return (
    <>
      <Scene state={state} />
      <Totals state={state} />
      <FishMenu state={state} />

      <div className="action">
        {state.running
          ? <button className="reel" onClick={() => api("stop", {}).then((s) => setState({ ...s, loaded: true }))}>Einholen</button>
          : <button className="cast" onClick={() => start()}>Auswerfen</button>}
      </div>

      <div className="dock">
        <button className="icon" onClick={() => setSheet(true)} title="Cookies ändern" aria-label="Cookies ändern">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Zm7.43-2.53c.04-.32.07-.64.07-.97s-.03-.66-.07-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.3 7.3 0 0 0-1.69-.98l-.38-2.65A.49.49 0 0 0 14 2h-4a.49.49 0 0 0-.49.42l-.38 2.65c-.61.25-1.17.58-1.69.98l-2.49-1a.5.5 0 0 0-.61.22l-2 3.46a.49.49 0 0 0 .12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.04.24.25.42.49.42h4c.25 0 .45-.18.49-.42l.38-2.65c.61-.25 1.17-.58 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65Z"/></svg>
        </button>
        <p className={`phase ${state.running ? "on" : ""}`}>{phaseLabel(state)}</p>
        <button className="icon" onClick={reset} title="Statistik zurücksetzen" aria-label="Statistik zurücksetzen">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7Z"/></svg>
        </button>
      </div>

      {error && !sheet && <p className="toast" role="alert" onClick={() => setError("")}>{error}</p>}

      {sheet && (
        <CookieSheet onStart={start} onClose={() => setSheet(false)} error={error}
          canClose={!!(localStorage.hubSession && localStorage.cfClearance)} />
      )}
    </>
  );
}
