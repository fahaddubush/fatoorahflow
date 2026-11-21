/**
 * InfiniteFooter: a scroll-driven footer that loops the page without a visible jump.
 *
 * What it does
 *  1. Wordmark "FatoorahFlow" rises letter by letter as the footer enters.
 *  2. Receipts stream toward you down an endless tunnel. They drift on their own, and scrolling pushes them
 *     forward or back (up-scroll reverses them). A diagonal ribbon slides behind and skews with scroll velocity.
 *  3. A manila folder grows out of the tunnel. The last stretch of scroll dives you into its mouth, so the
 *     screen fills with folder colour.
 *  4. When you rest on that full screen, the page is silently set to scrollY = 0 while the cover hides the cut,
 *     then a circular hole opens from the centre and the TOP of the page emerges from inside the folder.
 *     Scroll again and you fall in again: an infinite loop with no hard cut. "Back to top" does the same on demand.
 *
 * Integration
 *  - Drop this one file anywhere (e.g. src/components/InfiniteFooter.tsx) and render it as the LAST element of the
 *    page, outside any element that has a CSS transform or filter:   <InfiniteFooter isRtl={isRtl} />
 *  - Dependencies: react, react-dom, framer-motion (v11). Styling uses the app's Tailwind tokens:
 *      bg-paper, bg-manila-dark, text-ink*, text-stamp, border-ink, font-display, font-mono, and the `.edge-zig-bottom` utility.
 *    The decorative receipts use `bg-paper`, so they stay cream with dark ink on the night-desk theme.
 *  - Smooth-scroll libraries (Lenis): pass scrollToTop={() => lenis.scrollTo(0, { immediate: true })} so the
 *    library's internal position stays in sync. Without the prop it uses window.scrollTo(0, 0) with instant behaviour.
 *  - onLoop fires right after the jump to the top (the cover is still opaque), e.g. to replay the hero entrance.
 *  - Reduced motion (system setting, or reduceMotion prop): renders a plain, still footer with a Back to top button.
 *  - Pass loop={false} to keep the visuals but disable the auto-loop.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  animate, motion, useAnimationFrame, useInView, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform,
} from 'framer-motion';
import type { MotionValue } from 'framer-motion';
import { PaperclipClasp } from './PaperclipClasp';

export interface InfiniteFooterProps {
  isRtl?: boolean;
  reduceMotion?: boolean;
  loop?: boolean;
  scrollToTop?: () => void;
  onLoop?: () => void;
  className?: string;
  theme?: 'light' | 'dark';
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const WORD_A = Array.from('Fatoorah');
const WORD_B = Array.from('Flow');
const N_RECEIPTS = 15;

/* ------------------------------------------------------------------ receipts ------------------------------------------------------------------ */

function Receipt({ i, t, rtl, theme }: { i: number; t: MotionValue<number>; rtl: boolean; theme?: 'light' | 'dark' }) {
  const seed = useMemo(() => {
    const a = i * 2.399963, R = 22 + ((i * 47) % 28);
    const clipVariant = (i % 3) as 0 | 1 | 2;
    // slight natural tilt angle jitter (-4deg to +6deg)
    const clipTilt = Number((-4 + (((i * 73) % 100) / 10)).toFixed(1));
    return {
      x: Math.cos(a) * R * 0.52,
      y: Math.sin(a) * R * 0.38,
      r: ((i * 37) % 36) - 18,
      spin: ((i * 17) % 24) - 12,
      ry: ((i * 29) % 30) - 15,
      stamp: i % 3 === 0,
      bars: [58, 82, 44, 70, 36].map((w, k) => 30 + ((w + i * 11 + k * 7) % 60)),
      clipVariant,
      clipTilt,
    };
  }, [i]);
  const u = useTransform(t, (v) => (((i / N_RECEIPTS + v) % 1) + 1) % 1);
  const transform = useTransform(u, (k) => `translate3d(${seed.x}vw, ${seed.y}vh, ${-2600 + k * 2900}px) rotateZ(${seed.r + k * seed.spin}deg) rotateY(${seed.ry}deg)`);
  const opacity = useTransform(u, (k) => (k < 0.12 ? k / 0.12 : k > 0.74 ? Math.max(0, (1 - k) / 0.26) : 1));
  return (
    <motion.div aria-hidden className="absolute left-1/2 top-1/2 h-[220px] w-[145px]" style={{ transform, opacity, marginLeft: -72, marginTop: -110, willChange: 'transform, opacity' }}>
      <PaperclipClasp
        variant={seed.clipVariant}
        theme={theme}
        isRtl={rtl}
        position="top-right"
        size="sm"
        tilt={seed.clipTilt}
        offset={{ x: 14 }}
        className="h-full w-full"
        contentClassName="h-full w-full"
      >
        <div className="edge-zig-bottom h-full w-full bg-paper px-3 pb-8 pt-3 shadow-sheet">
          <p className="font-mono text-[8px] uppercase tracking-[.16em] text-ink-mute">{rtl ? 'فاتورة ضريبية' : 'Tax invoice'}</p>
          <div className="my-1.5 h-px bg-ink/70" />
          <p className="font-mono text-[8px] text-ink-soft" dir="ltr">INV-2026-{String(100 + i * 7).padStart(5, '0')}</p>
          {seed.bars.map((w, k) => <div key={k} className="mt-[7px] h-[5px] bg-ink/15" style={{ width: `${w}%` }} />)}
          <div className="mt-3 flex justify-between font-mono text-[8px] text-ink" dir="ltr"><span>VAT 15%</span><span>{(1200 + i * 183).toFixed(2)}</span></div>
          {seed.stamp && <span className="absolute bottom-6 end-3 -rotate-12 border-[1.5px] border-stamp px-1.5 py-[2px] font-mono text-[8px] uppercase tracking-[.14em] text-stamp mix-blend-multiply">{rtl ? 'مدفوعة' : 'Paid'}</span>}
        </div>
      </PaperclipClasp>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ folder you dive into ------------------------------------------------------------------ */

function DiveFolder({ approach, dive }: { approach: MotionValue<number>; dive: MotionValue<number> }) {
  const scale = useTransform([approach, dive], ([a, d]) => (0.5 + 0.5 * (a as number)) * (1 + Math.pow(d as number, 3.2) * 95));
  const opacity = useTransform(approach, [0, 0.35], [0, 1]);
  const open = useTransform(approach, [0.25, 0.95], [0, -158]);
  const paperY = useTransform(approach, [0.3, 1], [0, -64]);
  return (
    <motion.div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[170px] w-[250px]" style={{ scale, opacity, marginLeft: -125, marginTop: -85, transformOrigin: '50% 66%', perspective: 1000 }}>
      <motion.div className="edge-zig-bottom absolute bottom-[22px] left-1/2 w-[170px] -translate-x-1/2 bg-paper px-3 pb-5 pt-3 shadow-sheet" style={{ y: paperY }}>
        <div className="h-px bg-ink/70" />
        {[78, 56, 68].map((w, k) => <div key={k} className="mt-2 h-[5px] bg-ink/15" style={{ width: `${w}%` }} />)}
      </motion.div>
      <div className="absolute inset-0 rounded-[6px] bg-manila-dark shadow-lift" style={{ clipPath: 'polygon(0 100%, 0 12%, 4% 0, 46% 0, 52% 20%, 100% 20%, 100% 100%)' }} />
      <motion.div className="absolute inset-0 origin-left rounded-[6px] bg-gradient-to-br from-manila-light to-manila" style={{ rotateY: open, transformStyle: 'preserve-3d', clipPath: 'polygon(0 100%, 0 20%, 100% 20%, 100% 100%)' }} />
    </motion.div>
  );
}

/* ------------------------------------------------------------------ wordmark ------------------------------------------------------------------ */

function Letter({ ch, i, e, italic }: { ch: string; i: number; e: MotionValue<number>; italic?: boolean }) {
  const y = useTransform(e, (v) => `${(1 - easeInOut(clamp01(v * 1.9 - i * 0.07))) * 112}%`);
  return (
    <span className="inline-block overflow-hidden pb-[0.1em] -mb-[0.1em] align-bottom" style={{ paddingInlineEnd: italic ? '0.08em' : undefined }}>
      <motion.span className={`inline-block ${italic ? 'italic text-stamp' : ''}`} style={{ y }}>{ch}</motion.span>
    </span>
  );
}

/* ------------------------------------------------------------------ main ------------------------------------------------------------------ */

export function InfiniteFooter({ isRtl = false, reduceMotion, loop = true, scrollToTop, onLoop, className, theme: propTheme }: InfiniteFooterProps) {
  const system = useReducedMotion();
  const reduce = reduceMotion ?? Boolean(system);
  const t = (en: string, ar: string) => (isRtl ? ar : en);

  const [activeTheme, setActiveTheme] = useState<'light' | 'dark'>(() => {
    if (propTheme) return propTheme;
    if (typeof document !== 'undefined') {
      return (document.documentElement.dataset.theme as 'light' | 'dark') || 'light';
    }
    return 'light';
  });

  useEffect(() => {
    if (propTheme) {
      setActiveTheme(propTheme);
      return;
    }
    const updateTheme = () => {
      const current = (document.documentElement.dataset.theme as 'light' | 'dark') || 'light';
      setActiveTheme(current);
    };
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [propTheme]);

  const root = useRef<HTMLElement>(null);
  const lastInput = useRef(0);
  const busy = useRef(false);
  const [looping, setLooping] = useState(false);
  const inView = useInView(root, { margin: '300px' });
  const visible = useRef(false);
  visible.current = inView;

  // scroll progress: `enter` while the footer rises into view, `p` while its stage is pinned
  const { scrollYProgress: enter } = useScroll({ target: root, offset: ['start end', 'start start'] });
  const { scrollYProgress: p } = useScroll({ target: root, offset: ['start start', 'end end'] });
  const approach = useTransform(p, (v) => clamp01((v - 0.38) / 0.62));
  const dive = useTransform(p, (v) => clamp01((v - 0.72) / 0.28));
  const wordFade = useTransform(p, (v) => 1 - clamp01((v - 0.62) / 0.3));
  const tunnel = useMotionValue(0);

  // pointer parallax for the whole tunnel
  const px = useSpring(useMotionValue(0), { stiffness: 60, damping: 18 });
  const py = useSpring(useMotionValue(0), { stiffness: 60, damping: 18 });
  const rotY = useTransform(px, (v) => v * 6), rotX = useTransform(py, (v) => v * -4);
  const onMove = (ev: React.PointerEvent) => { px.set((ev.clientX / window.innerWidth - 0.5) * 2); py.set((ev.clientY / window.innerHeight - 0.5) * 2); };

  useAnimationFrame((time) => {
    if (!visible.current || reduce) return;
    tunnel.set((time / 1000) * 0.018 + window.scrollY * 0.00042);
  });

  /* ---------- the loop: cover, jump to top while hidden, open a hole from the centre ---------- */
  const cover = useMotionValue(0), hole = useMotionValue(0);
  const diveFade = useTransform(dive, [0.86, 0.98], [0, 1]);
  const overlayOpacity = useTransform([diveFade, cover], ([a, b]) => Math.max(a as number, b as number));
  const maskImage = useTransform(hole, (h) => (h <= 0.0001 ? 'none' : `radial-gradient(circle at 50% 50%, transparent ${h * 150}vmax, #000 calc(${h * 150}vmax + 2px))`));
  const ringSize = useTransform(hole, (h) => `${h * 300}vmax`);
  const ringOpacity = useTransform(hole, [0, 0.04, 0.9, 1], [0, 1, 1, 0]);
  const captionOpacity = useTransform([diveFade, hole], ([a, h]) => (a as number) * (1 - clamp01((h as number) * 6)));

  const startLoop = useCallback(async (manual = false) => {
    if (busy.current) return;
    busy.current = true; setLooping(true);
    const html = document.documentElement, prev = html.style.overflow; html.style.overflow = 'hidden';
    await animate(cover, 1, { duration: manual ? 0.6 : 0.18, ease: 'easeIn' });
    if (scrollToTop) scrollToTop(); else window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    onLoop?.();
    await new Promise((r) => window.setTimeout(r, 140));
    await animate(hole, 1, { duration: 1.75, ease: [0.65, 0, 0.35, 1] });
    hole.set(0); cover.set(0); html.style.overflow = prev; setLooping(false);
    window.setTimeout(() => { busy.current = false; }, 900);
  }, [cover, hole, scrollToTop, onLoop]);

  useEffect(() => {
    if (!loop || reduce) return;
    const mark = () => { lastInput.current = performance.now(); };
    const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 3;
    let timer = 0;
    const check = () => {
      window.clearTimeout(timer);
      if (busy.current || p.get() < 0.97 || !atBottom()) return;
      timer = window.setTimeout(() => { if (atBottom() && performance.now() - lastInput.current < 2500) void startLoop(); }, 420);
    };
    window.addEventListener('wheel', mark, { passive: true }); window.addEventListener('touchmove', mark, { passive: true }); window.addEventListener('keydown', mark);
    window.addEventListener('scroll', check, { passive: true });
    return () => { window.removeEventListener('wheel', mark); window.removeEventListener('touchmove', mark); window.removeEventListener('keydown', mark); window.removeEventListener('scroll', check); window.clearTimeout(timer); };
  }, [loop, reduce, p, startLoop]);

  /* ---------- still footer for reduced motion ---------- */
  if (reduce) {
    return (
      <footer aria-label={t('Page footer', 'تذييل الصفحة')} className={`px-4 pb-12 pt-12 sm:px-8 ${className ?? ''}`} dir={isRtl ? 'rtl' : 'ltr'}>
        <p className="select-none whitespace-nowrap text-center font-display text-[clamp(64px,15vw,240px)] leading-[.8] tracking-[-0.03em] text-ink" dir="ltr" aria-hidden>Fatoorah<i className="text-stamp">Flow</i></p>
      </footer>
    );
  }

  return (
    <>
      <footer ref={root} aria-label={t('Page footer', 'تذييل الصفحة')} className={`relative ${className ?? ''}`} style={{ height: loop ? '360vh' : '220vh' }} dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="sticky top-0 h-screen overflow-hidden" onPointerMove={onMove}>
          {/* receipt tunnel */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              perspective: 800,
              rotateY: rotY,
              rotateX: rotX,
              transformStyle: 'preserve-3d',
              opacity: wordFade,
              maskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,1) 16%, rgba(0,0,0,1) 84%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,1) 16%, rgba(0,0,0,1) 84%, transparent 100%)',
            }}
          >
            {Array.from({ length: N_RECEIPTS }, (_, i) => <Receipt key={i} i={i} t={tunnel} rtl={isRtl} theme={activeTheme} />)}
          </motion.div>

          {/* wordmark */}
          <motion.div className="absolute inset-0 grid place-items-center px-4" style={{ opacity: wordFade }}>
            <h2 className="select-none whitespace-nowrap text-center font-display text-[clamp(64px,16.5vw,270px)] leading-[.82] tracking-[-0.03em] text-ink" dir="ltr" aria-label="FatoorahFlow">
              {WORD_A.map((ch, i) => <Letter key={i} ch={ch} i={i} e={enter} />)}
              {WORD_B.map((ch, i) => <Letter key={`b${i}`} ch={ch} i={i + WORD_A.length} e={enter} italic />)}
            </h2>
          </motion.div>

          <DiveFolder approach={approach} dive={dive} />
        </div>
      </footer>

      {/* cover for the dive and the loop: lives on <body> so no ancestor transform can break position: fixed */}
      {typeof document !== 'undefined' && createPortal(
        <motion.div aria-hidden className="pointer-events-none fixed inset-0 z-[95] grid place-items-center bg-manila-dark" style={{ opacity: overlayOpacity, maskImage, WebkitMaskImage: maskImage }}>
          <motion.p className="font-display text-[clamp(36px,7vw,96px)] italic leading-none text-ink/80" style={{ opacity: captionOpacity }}>{t('and again.', 'ومن جديد.')}</motion.p>
        </motion.div>,
        document.body,
      )}
      {typeof document !== 'undefined' && looping && createPortal(
        <motion.div aria-hidden className="pointer-events-none fixed left-1/2 top-1/2 z-[96] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-manila-shade" style={{ width: ringSize, height: ringSize, opacity: ringOpacity }} />,
        document.body,
      )}
    </>
  );
}

export default InfiniteFooter;
