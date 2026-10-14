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
