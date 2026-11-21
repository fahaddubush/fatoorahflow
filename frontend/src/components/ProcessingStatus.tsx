import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../lib/settings';
import { fetchDocumentDetail, fetchJob, getPageImageUrl, ReviewApiError, updateJob } from '../api/client';
import { DocumentDetail, isActiveProcessing, JobStage, WorkflowJob } from '../types';
import { MachinePhase, MachineStage } from './MachineStage';
import { EASE } from './ui';
import type { FlightInfo } from './PaperFlight';
import { sound } from '../lib/sound';

interface ProcessingStatusProps {
  document: DocumentDetail;
  jobId: string;
  isRtl: boolean;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  onJobUpdate: (job: WorkflowJob) => void;
  dark?: boolean;
  onFlight?: (info: FlightInfo) => void;
}

const stages: JobStage[] = ['RENDER', 'EXTRACT', 'VALIDATE'];

export function ProcessingStatus({ document, jobId, isRtl, onBack, onRefresh, onJobUpdate, dark, onFlight }: ProcessingStatusProps) {
  const [job, setJob] = useState<WorkflowJob | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [reviewError, setReviewError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [action, setAction] = useState<'cancel' | 'retry' | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [ejecting, setEjecting] = useState(false);
  const [boxes, setBoxes] = useState<number[][] | undefined>(undefined);
  const reduce = useReducedMotion();
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;
  const update = useRef(onJobUpdate);
  update.current = onJobUpdate;
  const epoch = useRef(0);
  const ejectDone = useRef<((info?: FlightInfo) => void) | null>(null);
  const flight = useRef(onFlight);
  flight.current = onFlight;
  const status = job?.status ?? document.status;
  const active = isActiveProcessing(status);

  /** Plays the sheet out of the machine, resolving once it has settled on the desk. */
  const playEject = () => new Promise<FlightInfo | undefined>((resolve) => {
    if (reduce) { resolve(undefined); return; }
    const fallback = window.setTimeout(() => resolve(undefined), 9000);
    ejectDone.current = (info) => { window.clearTimeout(fallback); resolve(info); };
    setEjecting(true);
  });
  const landPaper = (info?: FlightInfo) => { if (info) { sound.click(); flight.current?.(info); } };

  useEffect(() => {
    const request = ++epoch.current;
    const controller = new AbortController();
    let timer: number | undefined;
    let stillProcessing = isActiveProcessing(document.status);

    const poll = async () => {
      if (controller.signal.aborted || request !== epoch.current) return;
      let next: WorkflowJob;
      try {
        next = await fetchJob(jobId, controller.signal);
      } catch (error) {
        if (controller.signal.aborted || request !== epoch.current) return;
        setStatusError(true);
        if (stillProcessing && !(error instanceof ReviewApiError && error.status === 404)) {
          timer = window.setTimeout(poll, 3000);
        }
        return;
      }
      if (controller.signal.aborted || request !== epoch.current) return;
      setJob(next);
      setStatusError(false);
      stillProcessing = isActiveProcessing(next.status);
      if (stillProcessing) {
        timer = window.setTimeout(poll, 1000);
      } else if (next.status === 'SUCCEEDED') {
        landPaper(await playEject());
        if (controller.signal.aborted || request !== epoch.current) return;
        try {
          await refresh.current();
        } catch {
          if (!controller.signal.aborted && request === epoch.current) { setEjecting(false); setReviewError(true); }
        }
      } else {
        update.current(next);
      }
    };

    if (!action) void poll();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, refreshKey, action]);

  const handleAction = async (operation: 'cancel' | 'retry') => {
    if (action) return;
    ++epoch.current;
    setAction(operation);
    setActionError(null);
    try {
      const result = await updateJob(jobId, operation);
      setJob(result);
      if (result.status === 'SUCCEEDED') {
        try {
          landPaper(await playEject());
          await onRefresh();
        } catch {
          setEjecting(false);
          setReviewError(true);
        }
      } else {
        onJobUpdate(result);
      }
    } catch (error) {
      setActionError(error instanceof ReviewApiError && error.status === 409
        ? (isRtl ? 'تغيرت حالة المعالجة. تحقق من الحالة الحالية.' : 'Processing status changed. Check the current state.')
        : (isRtl ? 'تعذر تحديث حالة المعالجة.' : 'Could not update processing status.'));
    } finally {
      setAction(null);
    }
  };

  const t = (english: string, arabic: string) => (isRtl ? arabic : english);
  const stageLabels: Record<JobStage, string> = {
    RENDER: t('Render PDF pages', 'عرض صفحات PDF'),
    EXTRACT: t('Extract invoice fields', 'استخراج حقول الفاتورة'),
    VALIDATE: t('Validate invoice', 'التحقق من الفاتورة'),
  };
  const labels: Partial<Record<typeof status, string>> = {
    UPLOADED: t('Queued', 'في قائمة الانتظار'),
    QUEUED: t('Queued', 'في قائمة الانتظار'),
    PROCESSING: t('Processing', 'قيد المعالجة'),
    SUCCEEDED: t('Ready for review', 'جاهزة للمراجعة'),
    FAILED: t('Processing failed', 'فشلت المعالجة'),
    CANCELLED: t('Processing cancelled', 'أُلغيت المعالجة'),
  };
  const stageIndex = job?.stage ? stages.indexOf(job.stage) : -1;
  // Once the page is rendered the preview sheet shows the real page; once fields are extracted it flashes their real boxes.
  const pageUrl = stageIndex >= 1 || ejecting || status === 'SUCCEEDED' ? getPageImageUrl(document.id, 1) : null;
  useEffect(() => {
    if (stageIndex < 2 && !ejecting && status !== 'SUCCEEDED') return;
    let cancelled = false;
    fetchDocumentDetail(document.id).then((d) => {
      if (cancelled) return;
      const list = Object.values(d.evidence ?? {}).flat().filter((b) => b.page === 1).map((b) => b.bbox as number[]);
      if (list.length) setBoxes(list);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [stageIndex, ejecting, status, document.id]);
  const canRetry = job?.can_retry && (job.status === 'FAILED' || job.status === 'CANCELLED');
  const canCancel = !!job && active && !job.cancellation_requested;

  const phase: MachinePhase = ejecting ? 'ejecting'
    : status === 'FAILED' || status === 'CANCELLED' ? 'failed'
    : status === 'PROCESSING' && job?.worker !== false ? 'scanning' : 'waiting';
  const stageName = job?.stage ?? 'QUEUE';
  const lcd: [string, string] = ejecting ? ['DONE', 'EJECTING'] : phase === 'failed' ? ['JAM', status === 'CANCELLED' ? 'CANCELLED' : 'FAILED']
    : phase === 'scanning' ? [stageName, `STEP ${Math.max(1, stageIndex + 1)} OF 3`] : ['QUEUED', 'WAITING FOR WORKER'];

  return (
    <section className="mx-auto max-w-[1200px]">
      <button type="button" onClick={onBack} className="group inline-flex items-center gap-2 font-mono text-[11px] caps tracking-label text-ink-soft hover:text-ink">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 transition-transform duration-500 ease-paper group-hover:-translate-x-1 rtl:rotate-180 rtl:group-hover:translate-x-1" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M14 8H3M7 3.5 2.5 8 7 12.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {t('Back to documents', 'العودة إلى المستندات')}
      </button>

      <div className="mt-4 grid items-center gap-6 lg:grid-cols-[1.4fr_1fr]">
        <motion.div className="relative h-[360px] sm:h-[520px]" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, ease: EASE }}>
          <MachineStage className="absolute inset-0" phase={phase} lcd={lcd} filename={document.filename} isRtl={isRtl} startInside dark={dark} stage={job?.stage ?? null} boxes={boxes} pageImageUrl={pageUrl} onEjected={(info) => ejectDone.current?.(info)} />
        </motion.div>

        <motion.div className="relative" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: EASE, delay: 0.15 }}>
          <div className="edge-zig-bottom bg-paper px-7 pb-14 pt-7 shadow-sheet" style={{ filter: 'drop-shadow(0 24px 28px rgba(60,42,12,.26))' }}>
            <p className="label">{t('Processing status', 'حالة المعالجة')}</p>
            <h1 className="mt-2 break-words font-display text-[34px] leading-[1.02]"><bdi>{document.filename}</bdi></h1>
            <p className="mt-3 inline-flex items-center gap-2 font-mono text-[12px] caps tracking-label text-carbon" role="status">
              <span className={`h-2 w-2 rounded-full ${active ? 'animate-blink bg-carbon' : status === 'FAILED' ? 'bg-stamp' : 'bg-ink-mute'}`} />
              {job?.cancellation_requested && active ? t('Cancellation requested', 'طُلب الإلغاء') : labels[status] ?? status}
            </p>

            {active && job?.worker === false && (
              <div className="mt-5 border-s-2 border-manila-shade bg-marker/30 px-3 py-2 text-[13px]">
                <p className="font-semibold">{t('Worker offline', 'عامل المعالجة غير متصل')}</p>
                <p className="text-ink-soft">{t('Processing can resume when the worker comes back online.', 'يمكن استئناف المعالجة عند عودة العامل إلى الاتصال.')}</p>
              </div>
            )}

            <div className="my-6 border-t border-dashed border-ink/40" />
            <ol className="space-y-4">
              {stages.map((stage, index) => {
                const done = status === 'SUCCEEDED' || ejecting || (stageIndex >= 0 && index < stageIndex);
                const running = !ejecting && job?.worker === true && status === 'PROCESSING' && stageIndex === index;
                return (
                  <li key={stage} className="flex items-baseline gap-3 text-[14px]">
                    <span className="font-mono text-[11px] text-ink-mute">{String(index + 1).padStart(2, '0')}</span>
                    <span className={`relative ${done ? 'text-ink' : running ? 'text-ink' : 'text-ink-mute'}`}>
                      {stageLabels[stage]}
                      {done && <motion.span className="absolute inset-x-0 top-1/2 h-px origin-left bg-ink/70 rtl:origin-right" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.7, ease: EASE }} />}
                    </span>
                    <span className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-ink/35" />
                    <span className={`font-mono text-[11px] caps tracking-label ${done ? 'text-ledger' : running ? 'text-carbon' : 'text-ink-faint'}`}>
                      {done ? t('Complete', 'اكتملت') : running ? <span className="animate-blink">{t('In progress', 'قيد التنفيذ')}</span> : t('Waiting', 'بالانتظار')}
                    </span>
                  </li>
                );
              })}
            </ol>

            {job?.error_code && (
              <div className="mt-6 border-s-2 border-stamp bg-stamp-wash/60 px-3 py-2 text-[13px] text-stamp-deep">
                <p>{failureMessage(job.error_code, isRtl)}</p>
                <code dir="ltr" className="mt-1 block font-mono text-[11px]">{job.error_code}</code>
              </div>
            )}
            {statusError && <p className="mt-4 text-[13px] text-stamp-deep" role="alert">{t('Could not load the latest processing status.', 'تعذر تحميل أحدث حالة للمعالجة.')}</p>}
            {reviewError && <p className="mt-4 text-[13px] text-stamp-deep" role="alert">{t('Processing finished, but the review could not be opened.', 'اكتملت المعالجة، لكن تعذر فتح المراجعة.')}</p>}
            {actionError && <p className="mt-4 text-[13px] text-stamp-deep" role="alert">{actionError}</p>}

            <div className="mt-7 flex flex-wrap gap-3">
              {canCancel && <button type="button" disabled={action !== null} onClick={() => void handleAction('cancel')} className="btn-line">{t('Cancel processing', 'إلغاء المعالجة')}</button>}
              {canRetry && <button type="button" disabled={action !== null} onClick={() => void handleAction('retry')} className="btn-ink"><span>{t('Retry processing', 'إعادة محاولة المعالجة')}</span></button>}
              {(statusError || reviewError) && (
                <button type="button" disabled={action !== null} onClick={() => { setReviewError(false); setRefreshKey((previous) => previous + 1); }} className="btn-line">{t('Refresh status', 'تحديث الحالة')}</button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function failureMessage(code: string, isRtl: boolean): string {
  if (code === 'OCR_REQUIRED') {
    return isRtl ? 'تتطلب هذه الفاتورة التعرف الضوئي على النص. ارفع مستند PDF نصيًا.' : 'This invoice needs OCR. Upload a PDF with selectable text.';
  }
  return isRtl ? 'سجّل عامل المعالجة المشكلة التالية.' : 'The worker reported a processing issue.';
}
