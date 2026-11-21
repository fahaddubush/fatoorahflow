import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MachineQuality, MotionMode, useSettings } from '../lib/settings';
import { EASE } from './ui';

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full border border-ink/25 p-[3px]">
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`flex-1 rounded-full px-3 py-1.5 font-mono text-[10.5px] caps tracking-label transition-colors duration-300 ${value === v ? 'bg-inkbg text-onink' : 'text-ink-soft hover:text-ink'}`}>
          {text}
        </button>
      ))}
    </div>
  );
}

/** Motion, 3D quality and sound mix: lets people turn the spectacle down without losing the design. */
export function SettingsPanel({ isRtl }: { isRtl: boolean }) {
  const { settings, update } = useSettings();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const t = (en: string, ar: string) => (isRtl ? ar : en);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', away); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={t('Display and sound settings', 'إعدادات العرض والصوت')} title={t('Settings', 'الإعدادات')}
        className="grid h-9 w-9 place-items-center rounded-full border border-ink/20 text-ink transition hover:bg-inkbg hover:text-onink">
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
          <path d="M3 6h8M15 6h2M3 14h2M9 14h8" /><circle cx="13" cy="6" r="2" /><circle cx="7" cy="14" r="2" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="dialog" aria-label={t('Settings', 'الإعدادات')} initial={{ opacity: 0, y: -10, rotate: isRtl ? 2 : -2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.45, ease: EASE }}
            className="edge-zig-bottom absolute end-0 top-[calc(100%+12px)] z-50 w-[310px] bg-paper px-5 pb-9 pt-5 shadow-sheet" style={{ filter: 'drop-shadow(0 18px 24px rgba(0,0,0,.25))' }}>
            <p className="label">{t('Desk settings', 'إعدادات المكتب')}</p>
            <div className="mt-4 space-y-5">
              <div>
                <p className="mb-2 text-[13px] font-semibold">{t('Motion', 'الحركة')}</p>
                <Segmented<MotionMode> label={t('Motion', 'الحركة')} value={settings.motion} onChange={(motion) => update({ motion })}
                  options={[['full', t('Full', 'كاملة')], ['calm', t('Calm', 'هادئة')], ['none', t('None', 'بلا')]]} />
                <p className="mt-1.5 text-[11.5px] leading-snug text-ink-mute">{t('Calm fades instead of moving. None stops all animation.', 'الهادئة تستبدل الحركة بالتلاشي. وبلا توقف كل الحركات.')}</p>
              </div>
              <div>
                <p className="mb-2 text-[13px] font-semibold">{t('3D machine', 'الجهاز ثلاثي الأبعاد')}</p>
                <Segmented<MachineQuality> label={t('3D machine', 'الجهاز ثلاثي الأبعاد')} value={settings.machine} onChange={(machine) => update({ machine })}
                  options={[['high', t('High', 'عالية')], ['light', t('Light', 'خفيفة')], ['off', t('Off', 'إيقاف')]]} />
                <p className="mt-1.5 text-[11.5px] leading-snug text-ink-mute">{t('Light drops shadows and paper physics. Off swaps in a flat illustration.', 'الخفيفة تلغي الظلال وفيزياء الورق. والإيقاف يستبدله برسم مسطح.')}</p>
              </div>
              <div>
                <p className="mb-2 text-[13px] font-semibold">{t('Sound mix', 'مستوى الصوت')}</p>
                <input type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={(e) => update({ volume: Number(e.target.value) })} aria-label={t('Master volume', 'مستوى الصوت العام')} className="w-full accent-[rgb(210,57,30)]" />
                <div className="mt-2 flex gap-4 text-[12.5px]">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={settings.ui} onChange={(e) => update({ ui: e.target.checked })} className="accent-[rgb(210,57,30)]" />{t('Effects', 'المؤثرات')}</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={settings.ambient} onChange={(e) => update({ ambient: e.target.checked })} className="accent-[rgb(210,57,30)]" />{t('Ambient room', 'أجواء المكتب')}</label>
                </div>
                <p className="mt-1.5 text-[11.5px] leading-snug text-ink-mute">{t('Turn sound on with the speaker button first.', 'فعّل الصوت أولاً بزر السماعة.')}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
