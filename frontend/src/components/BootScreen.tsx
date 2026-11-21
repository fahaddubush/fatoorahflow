import { useEffect, useState } from 'react';
import { animate, motion } from 'framer-motion';
import { useReducedMotion } from '../lib/settings';
import { EASE } from './ui';

/**
 * Opening sequence: a manila folder swings open, a receipt prints out of it line by line while a
 * ledger counter runs to 100, then the desk splits in two and lifts away to reveal the app.
 */
const LINES: [string, string][] = [
  ['Opening ledger', 'فتح دفتر الحسابات'],
  ['Indexing folders', 'فهرسة الملفات'],
  ['Loading ZATCA rules', 'تحميل قواعد هيئة الزكاة'],
  ['Warming the intake unit', 'تسخين جهاز الاستلام'],
];

export function BootScreen({ onReveal, onDone }: { onReveal: () => void; onDone: () => void }) {
  const reduce = useReducedMotion();
  const [count, setCount] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const total = reduce ? 0.35 : 2.9;
    const c = animate(0, 100, { duration: total, ease: [0.5, 0, 0.2, 1], onUpdate: (v) => setCount(Math.round(v)),
      onComplete: () => { window.setTimeout(() => { setLeaving(true); window.setTimeout(onReveal, reduce ? 0 : 450); window.setTimeout(onDone, reduce ? 50 : 1400); }, reduce ? 0 : 350); } });
    return () => c.stop();
  }, [reduce, onDone, onReveal]);

  const halfStyle = (top: boolean) => ({ clipPath: top ? 'inset(0 0 50% 0)' : 'inset(50% 0 0 0)' });
  const exit = (top: boolean) => ({ y: leaving ? (top ? '-101%' : '101%') : 0 });

  const Scene = (
    <div className="grain absolute inset-0 bg-desk">
      <div className="absolute inset-x-0 top-0 flex items-start justify-between px-6 pt-6 sm:px-10 sm:pt-8" dir="ltr">
        <div className="font-display text-[28px] leading-none text-ink">Fatoorah<em className="not-italic text-stamp">/</em><i>Flow</i></div>
      </div>

      <div className="absolute inset-0 grid place-items-center" dir="ltr">
        <div className="relative" style={{ perspective: 1100 }}>
          {/* receipt printing out of the folder */}
          <motion.div
            className="absolute bottom-[34px] left-1/2 w-[190px] -translate-x-1/2 origin-bottom bg-paper px-4 pb-8 pt-4 shadow-sheet edge-zig-bottom"
            initial={{ y: 0, clipPath: 'inset(100% 0 0 0)' }}
            animate={{ y: reduce ? -150 : -178, clipPath: 'inset(0% 0 0 0)' }}
            transition={{ duration: reduce ? 0.2 : 2.4, delay: reduce ? 0 : 0.7, ease: EASE }}
          >
            <p className="label !text-ink">Tax invoice</p>
            <div className="my-2 h-px bg-ink/80" />
            {LINES.map(([en], i) => (
              <motion.div key={en} className="flex items-center justify-between py-[3px] font-mono text-[10px] text-ink-soft"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : 1.2 + i * 0.38, duration: 0.2 }}>
                <span>{en.toUpperCase().slice(0, 18)}</span>
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : 1.5 + i * 0.38 }} className="text-ledger">OK</motion.span>
              </motion.div>
            ))}
            <div className="my-2 h-px bg-ink/80" />
            <div className="flex justify-between font-mono text-[11px] font-medium"><span>LOADED</span><span>{String(count).padStart(3, '0')}%</span></div>
          </motion.div>

          {/* folder: back panel, then a front cover that swings open */}
          <div className="relative h-[170px] w-[250px]">
            <div className="absolute inset-0 rounded-[6px] bg-manila-dark shadow-lift folder-tab" style={{ clipPath: 'polygon(0 100%, 0 12%, 4% 0, 46% 0, 52% 20%, 100% 20%, 100% 100%)' }} />
            <motion.div
              className="absolute inset-0 origin-left rounded-[6px] bg-gradient-to-br from-manila-light to-manila"
              style={{ transformStyle: 'preserve-3d', clipPath: 'polygon(0 100%, 0 20%, 100% 20%, 100% 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.5)' }}
              initial={{ rotateY: 0 }} animate={{ rotateY: reduce ? -150 : -158 }}
              transition={{ duration: reduce ? 0.2 : 1.3, delay: reduce ? 0 : 0.35, ease: EASE }}
            >
              <div style={{ backfaceVisibility: 'hidden' }} className="absolute bottom-4 left-4 font-mono text-[9px] caps tracking-label text-manila-shade">Inv. 2026 / KSA</div>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between px-6 pb-6 sm:px-10 sm:pb-8" dir="ltr">
        <div className="font-display text-[clamp(72px,14vw,168px)] leading-[.8] tracking-tight text-ink tabular-nums">{String(count).padStart(3, '0')}</div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100]" role="status" aria-label="Loading FatoorahFlow">
      {[true, false].map((top) => (
        <motion.div key={String(top)} className="absolute inset-0 overflow-hidden" style={halfStyle(top)} animate={exit(top)} transition={{ duration: 0.95, ease: [0.76, 0, 0.24, 1] }}>
          {Scene}
        </motion.div>
      ))}
    </div>
  );
}
