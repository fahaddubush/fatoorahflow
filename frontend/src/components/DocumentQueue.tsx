import React, { useRef, useState } from 'react';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import { sound } from '../lib/sound';
import { DocumentListItem, isActiveProcessing } from '../types';
import { StatusStamp, EASE, Tilt } from './ui';
import { MachineStage } from './MachineStage';

interface DocumentQueueProps {
  documents: DocumentListItem[];
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  onSelectDocument: (docId: string) => void;
  isRtl: boolean;
  loaded?: boolean;
  onFeed?: () => void;
  suspendMachine?: boolean;
  dark?: boolean;
}

/** The archive: a manila folder whose tabs are the status filters and whose contents are the invoices. */
export const DocumentQueue: React.FC<DocumentQueueProps> = ({ documents, activeFilter, onFilterChange, onSelectDocument, isRtl, loaded = true, onFeed, suspendMachine, dark }) => {
  const wrap = useRef<HTMLElement>(null);
  const inView = useInView(wrap, { once: true, margin: '0px 0px -18% 0px' });
  const [searchQuery, setSearchQuery] = useState('');
  const t = (en: string, ar: string) => (isRtl ? ar : en);

  const filterTabs = [
    { id: 'ALL', label: t('All', 'الكل') },
    { id: 'QUEUED', label: t('Queued', 'الانتظار') },
    { id: 'PROCESSING', label: t('Processing', 'المعالجة') },
    { id: 'NEEDS_REVIEW', label: t('Needs review', 'تتطلب التدقيق') },
    { id: 'READY_FOR_REVIEW', label: t('Ready', 'جاهزة') },
    { id: 'APPROVED', label: t('Approved', 'معتمدة') },
    { id: 'REJECTED', label: t('Rejected', 'مرفوضة') },
    { id: 'FAILED', label: t('Failed', 'فشلت') },
    { id: 'CANCELLED', label: t('Cancelled', 'أُلغيت') },
  ];

  const q = searchQuery.trim().toLowerCase();
  const filtered = documents.filter((d) => !q || d.filename.toLowerCase().includes(q) || d.id.toLowerCase().includes(q) || d.kind.toLowerCase().includes(q));

  return (
    <section ref={wrap} aria-label={t('Documents', 'المستندات')} className="paper-ink relative">
      <Tilt max={1.2}>
        {/* tabs */}
        <div className="relative z-10 -mb-px flex items-end gap-[3px] overflow-x-auto px-2 pt-2 [scrollbar-width:none]" role="tablist" aria-label={t('Filter by status', 'تصفية حسب الحالة')}>
          {filterTabs.map((tab, ti) => {
            const active = activeFilter === tab.id;
            return (
              <div key={tab.id} className="shrink-0">
                <motion.button
                  role="tab" aria-selected={active} onClick={() => { sound.tab(); onFilterChange(tab.id); }}
                  initial={{ x: (isRtl ? 1 : -1) * ti * 52, rotate: isRtl ? 6 : -6, opacity: 0 }}
                  animate={inView ? { x: 0, rotate: 0, opacity: 1 } : undefined}
                  transition={{ type: 'spring', stiffness: 130, damping: 17, delay: 0.06 * ti }}
                  className={`glare relative shrink-0 overflow-hidden whitespace-nowrap rounded-t-[10px] px-4 pb-2 pt-2.5 font-mono text-[11px] caps tracking-label transition-colors duration-300 ease-paper ${
                    active ? 'z-10 bg-manila-light pb-3 text-ink font-semibold' : 'bg-manila-dark/70 text-ink-soft hover:bg-manila hover:text-ink'}`}
                  style={{ boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,.55)' : 'inset 0 1px 0 rgba(255,255,255,.25)' }}
                >
                  {tab.label}
                </motion.button>
              </div>
            );
          })}
        </div>

        {/* folder body */}
        <div className="glare relative rounded-b-[14px] rounded-tr-[14px] bg-gradient-to-b from-manila-light to-manila p-3 shadow-lift sm:p-5" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.5), 0 30px 50px -28px rgba(60,42,12,.5)' }}>
        <div className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-[34px] leading-none text-ink">{t('The archive', 'الأرشيف')}</h2>
            <p className="label mt-2 !text-manila-shade" aria-live="polite">{filtered.length} {t('on file', 'في الملف')}</p>
          </div>
          <label className="group relative block w-full sm:w-72">
            <span className="sr-only">{t('Search invoices', 'بحث في الفواتير')}</span>
            <input
              type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t('Search the archive', 'ابحث في الأرشيف')}
              className="field-input !border-ink/40 !pb-2 !text-[14px] placeholder:!text-manila-shade"
            />
            <span className="pointer-events-none absolute -bottom-px start-0 h-[2px] w-full origin-left scale-x-0 bg-stamp transition-transform duration-500 ease-paper group-focus-within:scale-x-100 rtl:origin-right" />
          </label>
        </div>

        {loaded && documents.length === 0 && activeFilter === 'ALL' && !q ? (
          <div className="edge-zig-bottom rounded-t-[6px] bg-paper px-6 pb-16 pt-6 text-center shadow-sheet">
            <div className="relative mx-auto h-[340px] max-w-[620px]">
              {!suspendMachine && <MachineStage className="absolute inset-0" phase="idle" lcd={['EMPTY', 'NO INVOICES YET']} isRtl={isRtl} dark={dark} scrollLinked />}
            </div>
            <p className="font-display text-[40px] leading-none">{t('Feed your first invoice', 'ارفع أول فاتورة')}</p>
            <p className="mx-auto mt-3 max-w-md text-[15px] text-ink-soft">{t('The archive is empty. Drop a PDF into the intake unit and it will be read, checked and filed here.', 'الأرشيف فارغ. أفلت ملف PDF في جهاز الاستلام وسيُقرأ ويُدقَّق ويُحفظ هنا.')}</p>
            <button type="button" onClick={onFeed} className="btn-ink mt-7"><span>{t('Feed an invoice', 'ارفع فاتورة')}</span></button>
          </div>
        ) : (
        <div className="edge-zig-bottom overflow-hidden rounded-t-[6px] bg-paper shadow-sheet">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-start text-[13px]">
              <thead>
                <tr className="border-b border-ink/15 text-ink-mute">
                  {[t('No.', 'رقم'), t('Document', 'المستند'), t('Type', 'النوع'), t('Status', 'الحالة'), t('Pages', 'الصفحات'), t('Filed', 'تاريخ الرفع'), ''].map((h, i) => (
                    <th key={i} scope="col" className="label px-4 py-3 text-start font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false} mode="popLayout">
                  {!loaded ? (
                    Array.from({ length: 6 }, (_, i) => (
                      <motion.tr key={`sk-${i}`} exit={{ opacity: 0 }} className="border-b border-ink/10" aria-hidden>
                        <td colSpan={7} className="px-4 py-4">
                          <div className="flex items-center gap-5">
                            <span className="skeleton h-3 w-5 animate-shimmer rounded-sm" />
                            <span className="skeleton h-4 animate-shimmer rounded-sm" style={{ width: `${34 + ((i * 17) % 28)}%`, animationDelay: `${i * 0.15}s` }} />
                            <span className="skeleton ms-auto h-5 w-20 animate-shimmer rounded-sm" />
                            <span className="skeleton h-3 w-24 animate-shimmer rounded-sm" />
                          </div>
                        </td>
                      </motion.tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <motion.tr key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <td colSpan={7} className="px-4 py-20 text-center">
                        <p className="font-display text-3xl text-ink-soft">{t('Nothing filed here.', 'لا شيء في هذا الملف.')}</p>
                        <p className="label mt-2">{t('No documents found', 'لا توجد فواتير مطابقة')}</p>
                      </td>
                    </motion.tr>
                  ) : (
                    filtered.map((doc, i) => {
                      const inFlight = isActiveProcessing(doc.status) || doc.status === 'FAILED' || doc.status === 'CANCELLED';
                      return (
                        <motion.tr
                          key={doc.id} layout="position"
                          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.7, delay: Math.min(i, 10) * 0.05, ease: EASE }}
                          onClick={() => onSelectDocument(doc.id)} data-cursor="view"
                          className="group relative cursor-pointer border-b border-ink/10 last:border-0 transition-colors duration-300 hover:bg-marker/25"
                        >
                          <td className="relative px-4 py-4 font-mono text-[11px] text-ink-mute">
                            <span className="absolute inset-y-0 start-0 w-[3px] origin-top scale-y-0 bg-stamp transition-transform duration-500 ease-paper group-hover:scale-y-100" />
                            {String(i + 1).padStart(2, '0')}
                          </td>
                          <td className="px-4 py-4">
                            <button type="button" onClick={(e) => { e.stopPropagation(); onSelectDocument(doc.id); }} className="max-w-[22rem] truncate text-start text-[15px] font-medium transition-[transform,font-weight] duration-500 ease-paper group-hover:translate-x-1 group-hover:font-bold rtl:group-hover:-translate-x-1">
                              <bdi>{doc.filename}</bdi>
                            </button>
                          </td>
                          <td className="px-4 py-4 text-ink-soft capitalize">{doc.kind === 'unknown' ? '—' : doc.kind.replace(/_/g, ' ')}</td>
                          <td className="px-4 py-4"><StatusStamp status={doc.status} isRtl={isRtl} tilt={(i % 3) - 1} /></td>
                          <td className="px-4 py-4 font-mono text-ink-soft">{doc.pages}</td>
                          <td className="px-4 py-4 font-mono text-[11.5px] text-ink-mute" dir="ltr">
                            {new Date(doc.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td className="px-4 py-4 text-end">
                            <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-ink">
                              <span className="relative">
                                {inFlight ? t('View status', 'عرض حالة المعالجة') : t('Review', 'فحص وتدقيق')}
                                <span className="absolute -bottom-0.5 start-0 h-px w-full origin-left scale-x-0 bg-ink transition-transform duration-500 ease-paper group-hover:scale-x-100 rtl:origin-right" />
                              </span>
                              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 transition-transform duration-500 ease-paper group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M2 8h11M9 3.5 13.5 8 9 12.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </span>
                          </td>
                        </motion.tr>
                      );
                    })
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
          <div className="h-4" />
        </div>
        )}
        <div className="h-3" />
      </div>
      </Tilt>
    </section>
  );
};
