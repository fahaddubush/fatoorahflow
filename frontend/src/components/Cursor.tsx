import { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useReducedMotion } from '../lib/settings';

/**
 * A quiet trailing ring that swells into a labelled disc over elements marked data-cursor="view".
 * Native cursor is never hidden. Dashboard only; skipped for touch and reduced motion.
 */
export function Cursor({ enabled, label }: { enabled: boolean; label: string }) {
  const reduce = useReducedMotion();
  const fine = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
  const x = useSpring(useMotionValue(-100), { stiffness: 420, damping: 36, mass: 0.35 });
  const y = useSpring(useMotionValue(-100), { stiffness: 420, damping: 36, mass: 0.35 });
  const [mode, setMode] = useState<'idle' | 'view' | 'pen' | 'link' | 'hidden'>('hidden');

  useEffect(() => {
    if (!enabled || reduce || !fine) return;
    const move = (e: PointerEvent) => { x.set(e.clientX); y.set(e.clientY); };
    const over = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el?.closest) return;
      if (el.closest('input,textarea,select')) setMode('hidden');
      else if (el.closest('[data-cursor="view"]')) setMode('view');
      else if (el.closest('[data-cursor="pen"]')) setMode('pen');
      else if (el.closest('a,button,[role="tab"]')) setMode('link');
      else setMode('idle');
    };
    const out = (e: MouseEvent) => { if (!e.relatedTarget) setMode('hidden'); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerover', over); document.addEventListener('mouseout', out);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerover', over); document.removeEventListener('mouseout', out); setMode('hidden'); };
  }, [enabled, reduce, fine, x, y]);

  if (!enabled || reduce || !fine) return null;
  const size = mode === 'view' ? 78 : mode === 'pen' ? 30 : mode === 'link' ? 34 : 16;
  return (
    <motion.div aria-hidden className="pointer-events-none fixed left-0 top-0 z-[70]" style={{ x, y }}>
      <motion.div
        className="-translate-x-1/2 -translate-y-1/2 grid place-items-center rounded-full font-mono text-[10px] caps tracking-label text-paper"
        animate={{ width: size, height: size, opacity: mode === 'hidden' ? 0 : 1, backgroundColor: mode === 'view' ? 'rgb(210 57 30)' : mode === 'pen' ? 'rgb(244 223 78)' : 'rgba(210,57,30,0)', borderWidth: mode === 'view' || mode === 'pen' ? 0 : 1.5, rotate: mode === 'pen' ? -35 : 0 }}
        style={{ borderStyle: 'solid', borderColor: 'rgb(210 57 30 / .7)' }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      >
        {mode === 'view' && <span>{label}</span>}
        {mode === 'pen' && <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-[#15120E]" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2.5 13.5l.6-3L11 2.6a1.4 1.4 0 0 1 2 2L5.1 12.5z" strokeLinejoin="round" /></svg>}
      </motion.div>
    </motion.div>
  );
}
