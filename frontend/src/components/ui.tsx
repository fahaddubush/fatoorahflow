import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { animate, motion, useInView, useMotionValue, useSpring } from 'framer-motion';
import { useReducedMotion } from '../lib/settings';
import { DocumentStatus } from '../types';
import { statusLabel, statusTone, toneClass } from '../lib/status';

export const EASE = [0.22, 1, 0.36, 1] as const;

/** False while the boot screen covers the app, so entrance animations wait for the curtain to lift. */
export const ReadyContext = createContext(true);
export const useReady = () => useContext(ReadyContext);

/** Fades and lifts its children in once the app is ready, optionally when scrolled into view. */
export function Reveal({ children, delay = 0, y = 24, className, inView = false }: { children: React.ReactNode; delay?: number; y?: number; className?: string; inView?: boolean }) {
  const ready = useReady();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: '0px 0px -8% 0px' });
  const show = ready && (!inView || seen);
  return (
    <motion.div ref={ref} className={className} initial={reduce ? false : { opacity: 0, y }} animate={show ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.9, delay, ease: EASE }}>
      {children}
    </motion.div>
  );
}

/** Pulls its child toward the pointer, then settles back. */
export function Magnetic({ children, strength = 0.28, className }: { children: React.ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const x = useSpring(useMotionValue(0), { stiffness: 220, damping: 18, mass: 0.4 });
  const y = useSpring(useMotionValue(0), { stiffness: 220, damping: 18, mass: 0.4 });
  const move = (e: React.PointerEvent) => {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const leave = () => { x.set(0); y.set(0); };
  return (
    <motion.div ref={ref} onPointerMove={move} onPointerLeave={leave} style={{ x, y }} className={`inline-block ${className ?? ''}`}>
      {children}
    </motion.div>
  );
}

/** Counts up to a number once it scrolls into view. Non-numeric values render as-is. */
export function CountUp({ value, className }: { value: number | string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(typeof value === 'number' ? 0 : value);
  useEffect(() => {
    if (typeof value !== 'number') { setShown(value); return; }
    if (reduce) { setShown(value); return; }
    if (!inView) return;
    const c = animate(0, value, { duration: 1.4, ease: EASE, onUpdate: (v) => setShown(Math.round(v)) });
    return () => c.stop();
  }, [value, inView, reduce]);
  return <span ref={ref} className={className}>{shown}</span>;
}

/** Masked line reveal: text rises out of an invisible slot, the way a headline would on an awwwards hero. */
export function Rise({ children, delay = 0, className, as: Tag = 'span' }: { children: React.ReactNode; delay?: number; className?: string; as?: 'span' | 'div' | 'h1' | 'h2' | 'p' }) {
  const reduce = useReducedMotion();
  const ready = useReady();
  const M = motion[Tag] as typeof motion.span;
  return (
    <span className="inline-block overflow-hidden align-bottom pb-[0.12em] -mb-[0.12em]">
      <M
        className={`inline-block ${className ?? ''}`}
        initial={reduce ? false : { y: '110%', rotate: 2 }}
        animate={ready ? { y: 0, rotate: 0 } : undefined}
        transition={{ duration: 1.05, delay, ease: EASE }}
      >
        {children}
      </M>
    </span>
  );
}

export function Marquee({ items, reverse }: { items: string[]; reverse?: boolean }) {
  const row = (
    <div className="flex shrink-0 items-center gap-10 pe-10" aria-hidden>
      {items.map((t, i) => (
        <React.Fragment key={i}>
          <span className="whitespace-nowrap font-display text-[clamp(28px,4vw,44px)] italic leading-none text-ink/85">{t}</span>
          <span className="h-2 w-2 rotate-45 bg-stamp" />
        </React.Fragment>
      ))}
    </div>
  );
  return (
    <div className="overflow-hidden" dir="ltr">
      <div className="flex w-max animate-marquee will-change-transform" style={reverse ? { animationDirection: 'reverse' } : undefined}>
        {row}{row}
      </div>
    </div>
  );
}

export function StatusStamp({ status, isRtl, tilt = 0 }: { status: DocumentStatus; isRtl: boolean; tilt?: number }) {
  return (
    <span className={`stamp ${toneClass[statusTone[status]]}`} style={{ transform: `rotate(${tilt}deg)` }}>
      {statusLabel(status, isRtl)}
    </span>
  );
}

/** Hairline that draws itself in. */
export function DrawRule({ className = '', delay = 0 }: { className?: string; delay?: number }) {
  const ready = useReady();
  return (
    <motion.div
      className={`h-px origin-left bg-ink/80 rtl:origin-right ${className}`}
      initial={{ scaleX: 0 }} animate={ready ? { scaleX: 1 } : undefined} transition={{ duration: 1.2, delay, ease: EASE }}
    />
  );
}

/** Cursor-reactive 3D tilt. Sets --mx/--my/--ga on itself so any child with `.glare` can show a moving sheen. */
export function Tilt({ children, max = 6, className }: { children: React.ReactNode; max?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const rx = useSpring(useMotionValue(0), { stiffness: 170, damping: 18, mass: 0.5 });
  const ry = useSpring(useMotionValue(0), { stiffness: 170, damping: 18, mass: 0.5 });
  const move = (e: React.PointerEvent) => {
    if (reduce || !ref.current || e.pointerType === 'touch') return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * 2 * max); rx.set(-(py - 0.5) * 2 * max);
    ref.current.style.setProperty('--mx', `${px * 100}%`); ref.current.style.setProperty('--my', `${py * 100}%`); ref.current.style.setProperty('--ga', '1');
  };
  const leave = () => { rx.set(0); ry.set(0); ref.current?.style.setProperty('--ga', '0'); };
  return (
    <motion.div ref={ref} onPointerMove={move} onPointerLeave={leave} className={className}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 1000, transformStyle: 'preserve-3d' }}>
      {children}
    </motion.div>
  );
}

/** Types a value in character by character; `trigger` restarts it. */
export function Typewriter({ text, trigger, className }: { text: string; trigger: string | number; className?: string }) {
  return (
    <span className={className} aria-label={text}>
      {Array.from(text).map((ch, i) => (
        <motion.span key={`${trigger}-${i}`} aria-hidden initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.055, duration: 0.2 }}>{ch}</motion.span>
      ))}
    </span>
  );
}

/** Digits roll on reels like a mechanical counter. */
export function Odometer({ value, pad = 0, className, width = '0.6em' }: { value: number; pad?: number; className?: string; width?: string }) {
  const s = String(Math.max(0, Math.round(value))).padStart(pad, '0');
  return (
    <span className={`inline-flex ${className ?? ''}`} aria-label={s} dir="ltr">
      {Array.from(s).map((d, i) => (
        <span key={`${s.length}-${i}`} aria-hidden className="relative inline-block overflow-hidden text-center" style={{ height: '1em', lineHeight: '1em', width }}>
          <motion.span className="absolute inset-x-0 top-0 flex flex-col" initial={{ y: '0%' }} animate={{ y: `${-Number(d) * 10}%` }} transition={{ type: 'spring', stiffness: 55, damping: 14, delay: i * 0.07 }}>
            {Array.from({ length: 10 }, (_, n) => <span key={n} style={{ height: '1em', lineHeight: '1em' }}>{n}</span>)}
          </motion.span>
        </span>
      ))}
    </span>
  );
}
