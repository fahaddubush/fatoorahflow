import { useEffect, useRef, useState } from 'react';
import { animate } from 'framer-motion';

export interface FlightInfo { src: string; rect: { x: number; y: number; w: number; h: number } }

/**
 * Shared-element hand-off: the sheet that just left the machine lifts off the desk, un-tilts and glides into
 * the review screen's document panel (#paper-target), so the paper you watched is the page you review.
 */
export function PaperFlight({ info, onLand, onDone }: { info: FlightInfo; onLand: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [start] = useState(() => {
    const w = info.rect.w;
    return { left: info.rect.x + info.rect.w / 2 - w / 2, top: info.rect.y + info.rect.h / 2 - (w * 1.414) / 2, width: w, height: w * 1.414 };
  });

  useEffect(() => {
    let cancelled = false;
    const el = ref.current!;
    const wait = window.setTimeout(async () => {
      let target: HTMLElement | null = null;
      for (let i = 0; i < 40 && !target; i++) { target = document.getElementById('paper-target'); if (!target) await new Promise((r) => setTimeout(r, 75)); }
      if (cancelled) return;
      if (!target) { onLand(); onDone(); return; }
      const r = target.getBoundingClientRect();
      const ease = [0.22, 1, 0.36, 1] as const;
      const a = animate(0, 1, { duration: 1.35, ease, onUpdate: (p) => {
        const mix = (from: number, to: number) => from + (to - from) * p;
        el.style.left = `${mix(start.left, r.left)}px`; el.style.top = `${mix(start.top, r.top)}px`;
        el.style.width = `${mix(start.width, r.width)}px`; el.style.height = `${mix(start.height, r.height)}px`;
        el.style.transform = `perspective(1100px) rotateX(${mix(62, 0)}deg) translateZ(${Math.sin(p * Math.PI) * 60}px)`;
        el.style.boxShadow = `0 ${mix(6, 30)}px ${mix(10, 60)}px -${mix(4, 24)}px rgba(60,42,12,.5)`;
      } });
      await a.then(() => undefined);
      if (cancelled) return;
      onLand();
      await animate(1, 0, { duration: 0.5, onUpdate: (o) => { el.style.opacity = String(o); } }).then(() => undefined);
      if (!cancelled) onDone();
    }, 950);
    return () => { cancelled = true; window.clearTimeout(wait); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={ref} aria-hidden className="pointer-events-none fixed z-[65] origin-center bg-paper"
      style={{ ...start, transform: 'perspective(1100px) rotateX(62deg)', backgroundImage: `url(${info.src})`, backgroundSize: '100% 100%' }} />
  );
}
