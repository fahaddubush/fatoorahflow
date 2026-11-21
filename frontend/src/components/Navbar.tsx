import React from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import { Magnetic, EASE, useReady } from './ui';
import { SettingsPanel } from './SettingsPanel';

interface NavbarProps {
  isRtl: boolean;
  onToggleLanguage: () => void;
  onNewUpload: () => void;
  onGoHome: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ isRtl, onToggleLanguage, onNewUpload, onGoHome, theme, onToggleTheme, soundOn, onToggleSound }) => {
  const ready = useReady();
  const t = (en: string, ar: string) => (isRtl ? ar : en);
  return (
    <motion.header
      className="sticky top-0 z-40 border-b border-ink/10 bg-desk/85 backdrop-blur-md"
      initial={{ y: -24, opacity: 0 }} animate={ready ? { y: 0, opacity: 1 } : undefined} transition={{ duration: 0.9, ease: EASE }}
    >
      <div className="mx-auto flex h-[68px] max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-8">
        <button type="button" onClick={onGoHome} className="group flex items-center gap-3 text-start" aria-label={t('FatoorahFlow home', 'الصفحة الرئيسية لفاتورة فلو')}>
          <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0 transition-transform duration-500 ease-paper group-hover:-rotate-6" aria-hidden>
            <rect width="40" height="40" rx="9" fill="#15120E" />
            <path d="M8 15a2.5 2.5 0 0 1 2.5-2.5H17l2.6 3.2h9.9A2.5 2.5 0 0 1 32 18.2V29a2.5 2.5 0 0 1-2.5 2.5h-19A2.5 2.5 0 0 1 8 29z" fill="#D9B26A" />
            <path className="transition-transform duration-500 ease-paper group-hover:-translate-y-1" d="M14 9.5h12v15H14z" fill="#FBF8F0" />
            <path className="transition-transform duration-500 ease-paper group-hover:-translate-y-1" d="M16.5 14h7M16.5 17.5h7M16.5 21h4" stroke="#15120E" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M8 19.5h24V29a2.5 2.5 0 0 1-2.5 2.5h-19A2.5 2.5 0 0 1 8 29z" fill="#E7CB8D" />
          </svg>
          <span className="leading-none">
            <span className="block font-display text-[26px] leading-[.9] text-ink">
              {isRtl ? <span className="font-display">فاتورة فلو</span> : <>Fatoorah<i className="ms-[2px]">Flow</i></>}
            </span>
          </span>
        </button>

        <div className="flex items-center gap-3 sm:gap-5">

          <div className="flex items-center gap-1">
            <button type="button" onClick={onToggleSound} aria-pressed={soundOn} aria-label={t('Sound effects', 'المؤثرات الصوتية')} title={t(soundOn ? 'Sound on' : 'Sound off', soundOn ? 'الصوت مفعّل' : 'الصوت مُعطّل')}
              className="grid h-9 w-9 place-items-center rounded-full border border-ink/20 text-ink transition hover:bg-inkbg hover:text-onink">
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 8v4h3l4 3.5v-11L6 8z" />
                {soundOn ? <><path d="M13 7.5a3.5 3.5 0 0 1 0 5" /><path d="M15 5a7 7 0 0 1 0 10" /></> : <path d="M13.5 8l4 4M17.5 8l-4 4" />}
              </svg>
            </button>
            <button type="button" onClick={onToggleTheme} aria-pressed={theme === 'dark'} aria-label={t('Night desk theme', 'الوضع الليلي')} title={t(theme === 'dark' ? 'Switch to day desk' : 'Switch to night desk', theme === 'dark' ? 'التبديل إلى النهار' : 'التبديل إلى الليل')}
              className="grid h-9 w-9 place-items-center rounded-full border border-ink/20 text-ink transition hover:bg-inkbg hover:text-onink">
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {theme === 'dark' ? <><circle cx="10" cy="10" r="3.2" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" /></> : <path d="M16.5 12.2A6.8 6.8 0 0 1 7.8 3.5a6.8 6.8 0 1 0 8.7 8.7z" />}
              </svg>
            </button>
          </div>

          <SettingsPanel isRtl={isRtl} />

          <LayoutGroup>
            <button
              type="button" onClick={onToggleLanguage} role="switch" aria-checked={isRtl}
              aria-label={t('Switch to Arabic', 'التبديل إلى الإنجليزية')} title="Toggle language / تبديل اللغة"
              className="relative flex items-center rounded-full border border-ink/20 bg-ink/10 p-[3px] font-mono text-[11px] font-medium" dir="ltr"
            >
              {(['en', 'ar'] as const).map((l) => {
                const active = (l === 'ar') === isRtl;
                return (
                  <span key={l} className={`relative z-10 grid h-7 w-9 place-items-center transition-colors duration-300 ${active ? 'text-onink' : 'text-ink-soft'}`}>
                    {active && <motion.span layoutId="lang-thumb" className="absolute inset-0 -z-10 rounded-full bg-inkbg" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                    {l === 'en' ? 'EN' : <span className="font-sans text-[13px]">ع</span>}
                  </span>
                );
              })}
            </button>
          </LayoutGroup>

          <Magnetic strength={0.18}>
            <button type="button" onClick={onNewUpload} className="btn-ink">
              <span>{t('Feed an invoice', 'ارفع فاتورة')}</span>
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </Magnetic>
        </div>
      </div>
    </motion.header>
  );
};
