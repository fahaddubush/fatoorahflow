import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { sound } from '../lib/sound';
import { EASE } from './ui';

/**
 * Opening an invoice: the desk wipes in, a manila folder swings open with the invoice's sheet rising out of it,
 * then the desk wipes away onto the review screen. Total about 1.7 s; skipped in calm and none motion modes.
 */
export function FolderCurtain({ name, onCovered, onDone }: { name: string; onCovered: () => void; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    sound.tab();
    const a = window.setTimeout(() => { sound.slide(0.5); }, 420);
    const b = window.setTimeout(onCovered, 620);
    const c = window.setTimeout(() => setLeaving(true), 1150);
    const d = window.setTimeout(onDone, 1800);
    return () => [a, b, c, d].forEach(window.clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <motion.div aria-hidden className="grain fixed inset-0 z-[90] grid place-items-center bg-desk" dir="ltr"
      initial={{ clipPath: 'inset(0 0 100% 0)' }} animate={{ clipPath: leaving ? 'inset(100% 0 0 0)' : 'inset(0 0 0% 0)' }} transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}>
      <div className="relative" style={{ perspective: 1000 }}>
        <motion.div className="absolute bottom-[26px] left-1/2 w-[170px] -translate-x-1/2 bg-paper px-4 pb-6 pt-4 shadow-sheet edge-zig-bottom"
          initial={{ y: 0 }} animate={{ y: -118 }} transition={{ duration: 0.9, delay: 0.6, ease: EASE }}>
          <p className="label !text-ink">Tax invoice</p>
          <div className="my-2 h-px bg-ink/80" />
          <p className="truncate font-mono text-[10px] text-ink-soft">{name}</p>
          {[78, 60, 70].map((w, i) => <div key={i} className="mt-2 h-[5px] bg-ink/15" style={{ width: `${w}%` }} />)}
        </motion.div>
        <div className="relative h-[150px] w-[230px]">
          <div className="absolute inset-0 rounded-[6px] bg-manila-dark shadow-lift" style={{ clipPath: 'polygon(0 100%, 0 12%, 4% 0, 46% 0, 52% 20%, 100% 20%, 100% 100%)' }} />
          <motion.div className="absolute inset-0 origin-left rounded-[6px] bg-gradient-to-br from-manila-light to-manila" style={{ transformStyle: 'preserve-3d', clipPath: 'polygon(0 100%, 0 20%, 100% 20%, 100% 100%)' }}
            initial={{ rotateY: 0 }} animate={{ rotateY: -158 }} transition={{ duration: 0.8, delay: 0.3, ease: EASE }} />
        </div>
      </div>
    </motion.div>
  );
}
