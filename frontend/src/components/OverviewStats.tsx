import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AnalyticsSummary } from '../types';
import { EASE, Odometer, Tilt, useReady } from './ui';
import { sound } from '../lib/sound';
import { PaperclipClasp, getRandomClipVariant, ClipVariantIndex } from './PaperclipClasp';

interface OverviewStatsProps {
  analytics: AnalyticsSummary | null;
  isRtl: boolean;
  activeFilter?: string;
  onFilter?: (id: string) => void;
  theme?: 'light' | 'dark';
}

/** The dashboard numbers, set as a till receipt that prints in line by line. */
export const OverviewStats: React.FC<OverviewStatsProps> = ({ analytics, isRtl, activeFilter, onFilter, theme: propTheme }) => {
  const ready = useReady();
  const c = analytics?.counts_by_status;
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

  // On page load / refresh, pick one of the 3 theme clip variants (index 0, 1, or 2) randomly or from session state.
  const [clipVariant] = useState<ClipVariantIndex>(() => {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const saved = sessionStorage.getItem('ff-hero-clip-variant');
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (parsed === 0 || parsed === 1 || parsed === 2) {
          return parsed as ClipVariantIndex;
        }
      }
      const chosen = getRandomClipVariant();
      try {
        sessionStorage.setItem('ff-hero-clip-variant', String(chosen));
      } catch (_) {}
      return chosen;
    }
    return 0;
  });

  const rows: { id: string; label: string; value: number | string; accent?: 'red' | 'green' }[] = [
    { id: 'QUEUED', label: t('Queued or processing', 'قيد الانتظار أو المعالجة'), value: (c?.QUEUED ?? 0) + (c?.PROCESSING ?? 0) },
    { id: 'NEEDS_REVIEW', label: t('Needs review', 'تتطلب التدقيق'), value: c?.NEEDS_REVIEW ?? 0, accent: 'red' },
    { id: 'READY_FOR_REVIEW', label: t('Ready for review', 'جاهزة للاعتماد'), value: c?.READY_FOR_REVIEW ?? 0 },
    { id: 'APPROVED', label: t('Approved', 'معتمدة'), value: c?.APPROVED ?? 0, accent: 'green' },
    { id: 'FAILED', label: t('Processing failed', 'فشلت المعالجة'), value: c?.FAILED ?? 0 },
  ];
  const latency = analytics?.measured_avg_latency_ms;

  return (
    <Tilt max={7} className="mx-auto w-full max-w-[360px]">
    <motion.section
      aria-label={t('Document totals', 'إجمالي المستندات')}
      className="relative mx-auto w-full max-w-[360px] origin-top"
      initial={{ clipPath: 'inset(-38px 0 100% 0)', rotate: 0 }}
      animate={ready ? { clipPath: 'inset(-38px 0 -8% 0)', rotate: isRtl ? 1.2 : -1.2 } : undefined}
      transition={{ duration: 2.2, ease: EASE, delay: 0.35 }}
    >
      <PaperclipClasp
        variant={clipVariant}
        theme={activeTheme}
        position="top-right"
        tilt={isRtl ? -4 : 4}
        size="md"
        isRtl={isRtl}
        ariaLabel={t('Paperclip clasp', 'مشبك الورق')}
        className="w-full"
      >
        <div className="glare edge-zig-bottom bg-paper px-6 pb-12 pt-7 shadow-sheet" style={{ filter: 'drop-shadow(0 22px 26px rgba(60,42,12,.25))' }}>
          <div className="text-center">
            <p className="font-display text-[30px] leading-none">Fatoorah<i>Flow</i></p>
            <p className="label mt-2">{t('Daily intake report', 'تقرير الاستلام اليومي')}</p>
            <p className="mt-1 font-mono text-[10.5px] text-ink-mute" dir="ltr">{new Date().toISOString().slice(0, 10)}  ·  TENANT-DEMO-01</p>
          </div>
          <div className="my-5 border-t border-dashed border-ink/40" />

          <div className="flex items-end justify-between">
            <span className="label !text-ink">{t('Total documents', 'إجمالي المستندات')}</span>
            <button type="button" onClick={() => { sound.tear(); onFilter?.('ALL'); }} className="font-display text-[64px] leading-[.8] tabular-nums transition-colors hover:text-stamp" aria-label={t('Show all documents', 'عرض كل المستندات')}>
              <Odometer value={analytics?.total_documents ?? 0} width="0.52em" />
            </button>
          </div>
          <div className="my-5 border-t border-dashed border-ink/40" />

          <ul className="space-y-[10px]">
            {rows.map((r, i) => (
              <motion.li key={r.id} initial={{ opacity: 0, x: isRtl ? 8 : -8 }} animate={ready ? { opacity: 1, x: 0 } : undefined} transition={{ delay: 1.1 + i * 0.16, duration: 0.6, ease: EASE }}>
                <button type="button" onClick={() => { sound.tear(); onFilter?.(r.id); }} aria-pressed={activeFilter === r.id}
                  className={`group flex w-full items-baseline gap-2 text-start text-[13px] ${activeFilter === r.id ? 'text-ink' : 'text-ink-soft'} hover:text-ink`}>
                  <span className="relative">
                    {r.label}
                    <span className="absolute -bottom-0.5 start-0 h-[2px] w-full origin-left scale-x-0 bg-marker transition-transform duration-500 ease-paper group-hover:scale-x-100 rtl:origin-right" style={activeFilter === r.id ? { transform: 'scaleX(1)' } : undefined} />
                  </span>
                  <span className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-ink/40" />
                  <span className={`font-mono text-[15px] font-medium tabular-nums ${r.accent === 'red' && Number(r.value) > 0 ? 'text-stamp' : r.accent === 'green' ? 'text-ledger' : ''}`}>
                    <Odometer value={Number(r.value)} pad={2} width="0.62em" />
                  </span>
                </button>
              </motion.li>
            ))}
          </ul>

          <div className="my-5 border-t border-dashed border-ink/40" />
          <div className="flex items-baseline justify-between text-[13px] text-ink-soft">
            <span>{t('Avg processing time', 'متوسط زمن المعالجة')}</span>
            <span className="font-mono text-[15px] font-medium text-ink" dir="ltr">{latency != null ? `${(latency / 1000).toFixed(1)} s` : '—'}</span>
          </div>
          <div className="mt-6 flex h-9 items-stretch justify-center gap-[2px] opacity-80" aria-hidden dir="ltr">
            {Array.from({ length: 46 }, (_, i) => <span key={i} className="bg-ink" style={{ width: (i * 7) % 5 === 0 ? 3 : (i * 5) % 3 === 0 ? 1 : 2 }} />)}
          </div>
          <p className="mt-2 text-center font-mono text-[9.5px] caps tracking-label text-ink-mute">{t('Thank you · شكراً', 'شكراً · Thank you')}</p>
        </div>
      </PaperclipClasp>
    </motion.section>
    </Tilt>
  );
};
