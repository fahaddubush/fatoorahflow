import { useEffect, useRef } from 'react';

/** Dust motes drifting through the desk lamp's light on the night desk. 2D canvas, ~46 particles, paused when hidden. */
export function Motes({ enabled }: { enabled: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!enabled) return;
    const cv = ref.current!; const g = cv.getContext('2d')!;
    let w = 0, h = 0, raf = 0; const lamp = { x: window.innerWidth * 0.7, y: window.innerHeight * 0.12 };
    const size = () => { w = cv.width = window.innerWidth; h = cv.height = window.innerHeight; };
    size();
    const motes = Array.from({ length: 46 }, () => ({ x: Math.random() * w, y: Math.random() * h, r: 0.6 + Math.random() * 1.7, vx: (Math.random() - 0.5) * 0.12, vy: -0.05 - Math.random() * 0.15, ph: Math.random() * 6.28 }));
    const move = (e: PointerEvent) => { lamp.x = e.clientX; lamp.y = e.clientY; };
    window.addEventListener('pointermove', move); window.addEventListener('resize', size);
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      g.clearRect(0, 0, w, h);
      for (const m of motes) {
        m.x += m.vx + Math.sin(t / 2600 + m.ph) * 0.14; m.y += m.vy;
        if (m.y < -6) { m.y = h + 6; m.x = Math.random() * w; } if (m.x < -6) m.x = w + 6; if (m.x > w + 6) m.x = -6;
        const d2 = (m.x - lamp.x) ** 2 + (m.y - lamp.y) ** 2; const a = 0.08 + 0.55 * Math.exp(-d2 / (2 * 280 * 280));
        g.beginPath(); g.fillStyle = `rgba(255,208,146,${a * (0.6 + 0.4 * Math.sin(t / 900 + m.ph))})`; g.arc(m.x, m.y, m.r, 0, 6.283); g.fill();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', move); window.removeEventListener('resize', size); };
  }, [enabled]);
  if (!enabled) return null;
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[57]" />;
}
