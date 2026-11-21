import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../lib/settings';
import { sound } from '../lib/sound';

/** Shared SVG filters: rough ink edges for stamps and a hand-drawn wobble for marker strokes. */
export function InkFilters() {
  return (
    <svg width="0" height="0" className="pointer-events-none absolute" aria-hidden focusable="false">
      <defs>
        <filter id="ink-rough" x="-8%" y="-12%" width="116%" height="124%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" result="d" />
          <feGaussianBlur in="d" stdDeviation="0.45" />
        </filter>
        <filter id="marker-wobble" x="-5%" y="-30%" width="110%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.015 0.11" numOctaves="2" seed="9" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3.4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}

/**
 * A rubber stamp with mass: squashes on contact, throws ink spatter, shakes the page (onImpact) and leaves a faint
 * ring impression. REJECTED lands harder and heavier than APPROVED.
 */
export function InkStamp({ kind, label, animate, onImpact, pan = 0 }: { kind: 'APPROVED' | 'REJECTED'; label: string; animate: boolean; onImpact?: (heavy: boolean) => void; pan?: number }) {
  const reduce = useReducedMotion();
  const heavy = kind === 'REJECTED';
  const dur = heavy ? 0.62 : 0.78;
  const [burst, setBurst] = useState(0);
  const tone = heavy ? 'border-stamp text-stamp' : 'border-ledger text-ledger';
  const ink = heavy ? '#D2391E' : '#1E6A4D';
  const dots = useMemo(() => Array.from({ length: heavy ? 22 : 14 }, () => {
    const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * (heavy ? 150 : 100);
    return { x: Math.cos(a) * d, y: Math.sin(a) * d * 0.7, s: 2 + Math.random() * (heavy ? 7 : 5), delay: Math.random() * 0.05 };
  }), [heavy]);

  useEffect(() => {
    if (!animate || reduce) return;
    const id = window.setTimeout(() => { setBurst((b) => b + 1); onImpact?.(heavy); sound.thud(pan, heavy); }, (0.15 + dur * 0.45) * 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate]);

  return (
    <motion.div aria-hidden className="pointer-events-none absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2"
      initial={animate && !reduce ? { scaleX: heavy ? 4 : 3.2, scaleY: heavy ? 4 : 3.2, opacity: 0, rotate: heavy ? -34 : -24 } : false}
      animate={animate && !reduce
        ? { scaleX: [heavy ? 4 : 3.2, 1.12, 0.97, 1], scaleY: [heavy ? 4 : 3.2, 0.8, 1.04, 1], opacity: [0, 1, 1, 1], rotate: [heavy ? -34 : -24, -11, -11, -11] }
        : { scaleX: 1, scaleY: 1, opacity: 1, rotate: -11 }}
      transition={{ duration: dur, times: [0, 0.45, 0.72, 1], ease: 'easeOut', delay: animate ? 0.15 : 0 }}>
      {/* faint impression ring left by the rim of the stamp */}
      <span className={`absolute -inset-[7px] rounded-[9px] border-[2px] opacity-25 blur-[0.6px] ${tone}`} style={{ filter: 'url(#ink-rough)' }} />
      <span className={`block rounded-[6px] border-[5px] px-5 py-1 font-display text-[clamp(34px,6vw,64px)] leading-[1.1] mix-blend-multiply ${tone}`} style={{ filter: 'url(#ink-rough)', opacity: 0.94 }}>{label}</span>
      {animate && !reduce && burst > 0 && dots.map((d, i) => (
        <motion.span key={`${burst}-${i}`} className="absolute left-1/2 top-1/2 rounded-full" style={{ width: d.s, height: d.s, background: ink, marginLeft: -d.s / 2, marginTop: -d.s / 2 }}
          initial={{ x: 0, y: 0, opacity: 0.9, scale: 0.4 }} animate={{ x: d.x, y: d.y, opacity: 0, scale: 1 }} transition={{ duration: 0.7, delay: d.delay, ease: 'easeOut' }} />
      ))}
    </motion.div>
  );
}
