(() => {
  const c = document.querySelector('canvas.absolute.inset-0.h-full.w-full');
  let curr = c[Object.keys(c).find(k => k.startsWith('__reactFiber$'))];
  while (curr) {
    let h = curr.memoizedState;
    while (h) {
      const g = h.memoizedState?.current || h.memoizedState;
      if (g?.phase !== undefined && g?.entities !== undefined) {
        window.__GAME = g;
        Object.defineProperty(g, 'crashed', { get: () => null, set: () => { g.phase = 'running'; }, configurable: true });
        console.log("%c🔥 GODMODE AKTIV: Du ghostest jetzt durch alles durch!", "color:#00ff00;font-size:14px;font-weight:bold;");
        return;
      }
      h = h.next;
    }
    curr = curr.return;
  }
})();





speed+invis
(() => {
  const c = document.querySelector('canvas.absolute.inset-0.h-full.w-full');
  let curr = c[Object.keys(c).find(k => k.startsWith('__reactFiber$'))];
  
  while (curr) {
    let h = curr.memoizedState;
    while (h) {
      const g = h.memoizedState?.current || h.memoizedState;
      if (g?.phase !== undefined && g?.entities !== undefined) {
        window.__GAME = g;

        // 1. NOCLIP / GODMODE: Crash blockieren & Phase auf 'running' fixieren
        Object.defineProperty(g, 'crashed', {
          get: () => null,
          set: () => { g.phase = 'running'; },
          configurable: true
        });

        // 2. SPEEDHACK: Mindest-Speed locken oder Multiplikator draufballern
        // Hier kannst du die Wunschgeschwindigkeit einstellen (Standard max ist meist ~330 km/h)
        const SPEED_BOOST = 950; // Mach 1000+ für Warp-Speed!

        if (window.__SPEED_INTERVAL) clearInterval(window.__SPEED_INTERVAL);
        window.__SPEED_INTERVAL = setInterval(() => {
          if (g.phase === 'running') {
            g.speed = Math.max(g.speed, SPEED_BOOST);
            g.crashed = null; // Doppelte Absicherung
          }
        }, 16);

        console.log("%c🔥 NOCLIP + SPEEDHACK AKTIV! 🔥", "color:#00ff00;font-size:16px;font-weight:bold;");
        console.log(`Speed gelockt auf mind. ${SPEED_BOOST} km/h.`);
        return;
      }
      h = h.next;
    }
    curr = curr.return;
  }
})();
