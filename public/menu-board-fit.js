export function fitMenuBoard(board) {
  const panel = board.querySelector('.menu-board-panel');
  function resize() {
    if (!panel.clientWidth || !panel.clientHeight) return;
    const setScale = scale => board.style.setProperty('--text-scale', scale);
    const fits = () => panel.scrollHeight <= panel.clientHeight + 1 &&
      panel.scrollWidth <= panel.clientWidth + 1;

    setScale(1);
    if (fits()) return;

    let best = 0;
    let limit = 1;
    for (let step = 0; step < 8; step++) {
      const scale = (best + limit) / 2;
      setScale(scale);
      if (fits()) best = scale;
      else limit = scale;
    }
    setScale(best);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(panel);
  resize();
  return () => observer.disconnect();
}