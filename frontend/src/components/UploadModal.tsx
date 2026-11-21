import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotion } from '../lib/settings';
import { uploadDocument } from '../api/client';
import { MachinePhase, MachineStage } from './MachineStage';
import { EASE } from './ui';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (docId: string) => void;
  isRtl: boolean;
  dark?: boolean;
  /** Files dropped onto the dashboard: loaded straight into the queue and fed without further clicks. */
  initialFiles?: File[];
  onConsumeInitial?: () => void;
  /** Called after a multi-file batch finishes (single files open the processing view instead). */
  onBatchDone?: () => void;
}

type Status = 'queued' | 'feeding' | 'filed' | 'failed';
interface QueuedFile { id: string; file: File; key: string; status: Status; error?: string }

const FIRST_FEED_MS = 3500; // the first sheet takes this long to be drawn in
const NEXT_FEED_MS = 2300;  // later sheets in a batch go through a little quicker
const MAX_FILES = 10;
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onUploadSuccess, isRtl, dark, initialFiles, onConsumeInitial, onBatchDone }) => {
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [jam, setJam] = useState(false);
  const [resting, setResting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();
  const auto = useRef(false);
  const t = (en: string, ar: string) => (isRtl ? ar : en);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isUploading) onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [isOpen, isUploading, onClose]);

  const addFiles = (list: FileList | File[] | null | undefined) => {
    if (!list || isUploading) return false;
    const incoming: QueuedFile[] = []; let problem: string | null = null;
    for (const file of Array.from(list)) {
      if (!/\.pdf$/i.test(file.name)) { problem = isRtl ? 'اختر مستندات PDF فقط.' : 'Choose PDF documents only.'; continue; }
      if (file.size > 25 * 1024 * 1024) { problem = isRtl ? 'يتجاوز الملف الحد الأقصى وهو 25 ميبيبايت.' : 'A file exceeds the 25 MiB limit.'; continue; }
      incoming.push({ id: rid(), file, key: rid(), status: 'queued' });
    }
    setErrorMsg(problem);
    if (incoming.length) setQueue((q) => [...q.filter((x) => x.status === 'queued'), ...incoming].slice(0, MAX_FILES));
    return incoming.length > 0;
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { addFiles(e.target.files); e.target.value = ''; };

  const patch = (id: string, p: Partial<QueuedFile>) => setQueue((q) => q.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const handleSubmit = async (items = queue) => {
    const todo = items.filter((x) => x.status === 'queued');
    if (!todo.length || isUploading) return;
    setIsUploading(true); setErrorMsg(null);
    let firstId: string | null = null; let ok = 0;
    for (let i = 0; i < todo.length; i++) {
      const item = todo[i];
      patch(item.id, { status: 'feeding' });
      const began = performance.now();
      try {
        const res = await uploadDocument(item.file, item.key);
        const minimum = i === 0 ? FIRST_FEED_MS : NEXT_FEED_MS;
        await new Promise((r) => window.setTimeout(r, reduce ? 0 : Math.max(0, minimum - (performance.now() - began))));
        patch(item.id, { status: 'filed' }); ok++; firstId = firstId ?? (res.document_id || res.id);
        if (i < todo.length - 1) { setResting(true); await new Promise((r) => window.setTimeout(r, reduce ? 0 : 750)); setResting(false); }
      } catch (err: unknown) {
        patch(item.id, { status: 'failed', error: err instanceof Error ? err.message : 'Upload failed' });
        setJam(true); window.setTimeout(() => setJam(false), 2200);
        setErrorMsg(isRtl ? 'تعذر رفع المستند. تحقق من الملف وحاول مرة أخرى.' : err instanceof Error ? err.message : 'Upload failed');
        setResting(true); await new Promise((r) => window.setTimeout(r, reduce ? 0 : 1200)); setResting(false);
      }
    }
    setIsUploading(false);
    if (ok === 0) return;
    setQueue([]);
    if (todo.length === 1 && firstId) onUploadSuccess(firstId); else onBatchDone?.();
    onClose();
  };

  // files dropped on the dashboard: queue them and feed immediately
  useEffect(() => {
    if (!isOpen || !initialFiles?.length || auto.current) return;
    auto.current = true;
    const items: QueuedFile[] = [];
    for (const file of initialFiles.slice(0, MAX_FILES)) if (/\.pdf$/i.test(file.name) && file.size <= 25 * 1024 * 1024) items.push({ id: rid(), file, key: rid(), status: 'queued' });
    onConsumeInitial?.();
    if (!items.length) { setErrorMsg(isRtl ? 'اختر مستندات PDF فقط.' : 'Choose PDF documents only.'); return; }
    setQueue(items);
    window.setTimeout(() => { void handleSubmit(items); }, 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialFiles]);
  useEffect(() => { if (!isOpen) auto.current = false; }, [isOpen]);

  const current = queue.find((x) => x.status === 'feeding') ?? queue.find((x) => x.status === 'queued');
  const waiting = queue.filter((x) => x.status === 'queued' || x.status === 'feeding').length;
  const done = queue.filter((x) => x.status === 'filed').length;
  const phase: MachinePhase = jam ? 'failed' : isUploading && !resting && queue.some((x) => x.status === 'feeding') ? 'feeding' : 'idle';
  const name = current?.file.name ?? '';
  const stem = name.replace(/\.pdf$/i, '');
  const total = queue.length;
  const lcd: [string, string] = jam ? ['JAM', 'UPLOAD FAILED'] : isUploading ? [total > 1 ? `FEED ${Math.min(done + 1, total)}/${total}` : 'FEEDING', stem] : current ? [total > 1 ? `${total} LOADED` : 'LOADED', stem] : ['READY', 'FEED A SHEET'];
  const label: Record<Status, string> = { queued: t('Queued', 'بالانتظار'), feeding: t('Feeding', 'قيد السحب'), filed: t('Filed', 'تم'), failed: t('Failed', 'فشل') };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          data-lenis-prevent className="fixed inset-0 z-50 overflow-y-auto bg-desk/97 backdrop-blur-xl"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.5 } }} transition={{ duration: 0.5 }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="upload-title" className="mx-auto grid min-h-full max-w-[1200px] items-center gap-6 px-4 py-10 md:grid-cols-[1.35fr_1fr] md:px-8">
            <motion.div className="relative order-2 h-[340px] md:order-none md:h-[600px]" initial={{ opacity: 0, x: isRtl ? 60 : -60 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 1, ease: EASE, delay: 0.1 }}>
              <MachineStage className="absolute inset-0" phase={phase} filename={name} lcd={lcd} isRtl={isRtl} dark={dark} stackCount={Math.max(1, waiting)} />
            </motion.div>

            <motion.div className="relative" initial={{ opacity: 0, y: 40, rotate: isRtl ? -2 : 2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 1, ease: EASE, delay: 0.25 }}>
              <div className="edge-zig-bottom bg-paper px-7 pb-14 pt-7 shadow-sheet" style={{ filter: 'drop-shadow(0 26px 30px rgba(60,42,12,.28))' }}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 id="upload-title" className="font-display text-[40px] leading-[.95]">{t('Upload tax invoices', 'رفع فواتير ضريبية')}</h3>
                  </div>
                  <button type="button" onClick={onClose} disabled={isUploading} aria-label={t('Close upload', 'إغلاق نافذة الرفع')}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-ink/25 transition hover:rotate-90 hover:border-ink hover:bg-inkbg hover:text-onink disabled:opacity-30">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M3 3l10 10M13 3 3 13" strokeLinecap="round" /></svg>
                  </button>
                </div>

                <button
                  type="button" disabled={isUploading}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`group relative mt-7 block w-full px-6 py-9 text-center transition-colors duration-500 ${dragOver ? 'bg-marker/50' : 'bg-paper-warm hover:bg-marker/25'}`}
                >
                  {(['top-0 start-0 border-t border-s', 'top-0 end-0 border-t border-e', 'bottom-0 start-0 border-b border-s', 'bottom-0 end-0 border-b border-e'] as const).map((c) => (
                    <span key={c} className={`absolute h-3 w-3 border-ink transition-all duration-500 ease-paper group-hover:h-5 group-hover:w-5 ${c}`} />
                  ))}
                  <p className="font-display text-[26px] leading-tight">{dragOver ? t('Release to load', 'أفلت للتحميل') : t('Drop PDFs here', 'أفلت ملفات PDF هنا')}</p>
                  <p className="mt-2 text-[13px] text-ink-soft">{t('or click to choose one or several files', 'أو اضغط لاختيار ملف أو عدة ملفات')}</p>
                </button>
                <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} accept=".pdf,application/pdf" disabled={isUploading} className="hidden" aria-label={t('Choose invoice PDFs', 'اختر ملفات الفواتير')} />

                <AnimatePresence initial={false}>
                  {queue.length > 0 && (
                    <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.5, ease: EASE }} className="mt-5 overflow-hidden" aria-label={t('Loaded files', 'الملفات المحمّلة')}>
                      {queue.map((q) => (
                        <motion.li key={q.id} layout initial={{ opacity: 0, x: isRtl ? 16 : -16 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3 border-b border-dashed border-ink/35 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-mono text-[13px]" dir="ltr">{q.file.name}</p>
                            <p className="font-mono text-[10.5px] text-ink-mute" dir="ltr">{(q.file.size / 1024).toFixed(1)} KB</p>
                          </div>
                          <span className={`stamp ${q.status === 'filed' ? 'border-ledger text-ledger' : q.status === 'failed' ? 'border-stamp text-stamp' : q.status === 'feeding' ? 'border-carbon text-carbon' : 'border-ink-mute text-ink-mute'}`}>{label[q.status]}</span>
                          {q.status === 'queued' && (
                            <button type="button" disabled={isUploading} aria-label={`${t('Remove', 'إزالة')} ${q.file.name}`} onClick={() => setQueue((all) => all.filter((x) => x.id !== q.id))}
                              className="shrink-0 font-mono text-[11px] caps tracking-label text-stamp underline-offset-4 hover:underline disabled:opacity-40">{t('Remove', 'إزالة')}</button>
                          )}
                        </motion.li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>

                {errorMsg && <p role="alert" className="mt-5 border-s-2 border-stamp bg-stamp-wash/60 px-3 py-2 text-[13px] font-medium text-stamp-deep">{errorMsg}</p>}

                <div className="mt-7 flex flex-wrap items-center justify-end gap-3">
                  <button type="button" onClick={onClose} disabled={isUploading} className="btn-line">{t('Cancel', 'إلغاء')}</button>
                  <button type="button" onClick={() => void handleSubmit()} disabled={!queue.some((x) => x.status === 'queued') || isUploading} className="btn-ink">
                    <span>{isUploading ? t('Feeding the sheets…', 'جارٍ سحب المستندات…') : queue.length > 1 ? t(`Upload ${queue.length} invoices`, `رفع ${queue.length} فواتير`) : t('Upload and queue', 'رفع وإضافة إلى قائمة المعالجة')}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
