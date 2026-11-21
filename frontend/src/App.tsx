import React, { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { AnalyticsSummary, DocumentDetail as DocDetailType, DocumentListItem, isActiveProcessing, WorkflowJob } from './types';
import { fetchAnalytics, fetchDocuments, fetchDocumentDetail } from './api/client';
import { Navbar } from './components/Navbar';
import { OverviewStats } from './components/OverviewStats';
import { DocumentQueue } from './components/DocumentQueue';
import { DocumentDetail } from './components/DocumentDetail';
import { UploadModal } from './components/UploadModal';
import { ProcessingStatus } from './components/ProcessingStatus';
import { AnimatePresence, motion, useScroll, useTransform } from 'framer-motion';
import Lenis from 'lenis';
import { Cursor } from './components/Cursor';
import { FlightInfo, PaperFlight } from './components/PaperFlight';
import { sound } from './lib/sound';
import { useSettings } from './lib/settings';
import { InkFilters } from './components/Ink';
import { FolderCurtain } from './components/FolderCurtain';
import { BootScreen } from './components/BootScreen';
import { DrawRule, EASE, Magnetic, Marquee, ReadyContext, Rise } from './components/ui';
import { InfiniteFooter } from './components/InfiniteFooter';

export const App: React.FC = () => {
  const [isRtl, setIsRtl] = useState<boolean>(false);
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocDetailType | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState<boolean>(false);
  const [documentError, setDocumentError] = useState(false);
  const selectionRequest = useRef(0);
  const dashboardRequest = useRef(0);
  const currentDocumentId = useRef<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const skipBoot = useRef(new URLSearchParams(window.location.search).has('noboot')).current;
  const [booting, setBooting] = useState(!skipBoot);
  const [ready, setReady] = useState(skipBoot);
  const closeUpload = useCallback(() => setIsUploadOpen(false), []);
  const finishBoot = useCallback(() => setBooting(false), []);
  const revealApp = useCallback(() => setReady(true), []);
  const t = (en: string, ar: string) => (isRtl ? ar : en);
  const [loaded, setLoaded] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('ff-theme') === 'dark' ? 'dark' : 'light'));
  const [soundOn, setSoundOn] = useState(false);
  const [flight, setFlight] = useState<FlightInfo | null>(null);
  const [landed, setLanded] = useState(false);
  const dark = theme === 'dark';
  const { settings } = useSettings();
  const [dragging, setDragging] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[] | undefined>(undefined);
  const [curtain, setCurtain] = useState<{ id: string; name: string } | null>(null);
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 520], [0, -46]);
  const receiptY = useTransform(scrollY, [0, 620], [0, 240]);
  const receiptRot = useTransform(scrollY, [0, 620], [0, isRtl ? -7 : 7]);
  const receiptScale = useTransform(scrollY, [0, 620], [1, 0.92]);
  const toggleSound = () => { const next = !soundOn; sound.setEnabled(next); setSoundOn(next); };
  const startFlight = useCallback((info: FlightInfo) => { setLanded(false); setFlight(info); }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('ff-theme', theme);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'dark' ? '#19120D' : '#E9E1CF');
  }, [theme]);

  const lenisRef = useRef<Lenis | null>(null);

  // Weighted smooth scrolling.
  useEffect(() => {
    if (settings.motion !== 'full' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.95 });
    lenisRef.current = lenis;
    let raf = 0;
    const loop = (time: number) => { lenis.raf(time); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [settings.motion]);

  const toggleTheme = useCallback((event?: React.MouseEvent) => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    sound.click();

    const doc = typeof document !== 'undefined' ? (document as any) : null;
    if (
      !doc ||
      typeof doc.startViewTransition !== 'function' ||
      settings.motion !== 'full' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setTheme(nextTheme);
      return;
    }

    let x = event?.clientX;
    let y = event?.clientY;

    if (typeof x !== 'number' || typeof y !== 'number') {
      const btn = (event?.currentTarget as HTMLElement) || document.querySelector('[aria-label*="theme"], [aria-label*="الوضع"]');
      if (btn) {
        const rect = btn.getBoundingClientRect();
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
      } else {
        x = window.innerWidth / 2;
        y = window.innerHeight / 2;
      }
    }

    const endRadius = Math.ceil(
      Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      ) * 1.05
    );

    document.documentElement.classList.add('theme-transitioning');

    const transition = doc.startViewTransition(() => {
      flushSync(() => {
        setTheme(nextTheme);
        document.documentElement.dataset.theme = nextTheme;
        document.querySelector('meta[name=theme-color]')?.setAttribute('content', nextTheme === 'dark' ? '#19120D' : '#E9E1CF');
      });
    });

    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ];

      const anim = document.documentElement.animate(
        {
          clipPath,
        },
        {
          duration: 800,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)',
        }
      );

      anim.onfinish = () => {
        document.documentElement.classList.remove('theme-transitioning');
      };
    }).catch(() => {
      document.documentElement.classList.remove('theme-transitioning');
    });

    transition.finished.finally(() => {
      document.documentElement.classList.remove('theme-transitioning');
    });
  }, [theme, settings.motion]);

  useEffect(() => { sound.setTheme(dark); }, [dark]);

  // Desk lamp follows the pointer on the night desk.
  useEffect(() => {
    if (!dark) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { document.documentElement.style.setProperty('--lx', `${e.clientX}px`); document.documentElement.style.setProperty('--ly', `${e.clientY}px`); });
    };
    window.addEventListener('pointermove', move);
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(raf); };
  }, [dark]);

  // Sync RTL language mode with HTML root element
  useEffect(() => {
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = isRtl ? 'ar' : 'en';
  }, [isRtl]);

  const loadData = useCallback(async () => {
    const request = ++dashboardRequest.current;
    try {
      const [docsRes, statsRes] = await Promise.all([
        fetchDocuments(activeFilter),
        fetchAnalytics(),
      ]);
      if (request === dashboardRequest.current) {
        setDocuments(docsRes.items);
        setAnalytics(statsRes);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      if (request === dashboardRequest.current) setLoaded(true);
    }
  }, [activeFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const hasActiveJobs = documents.some((doc) => isActiveProcessing(doc.status)) ||
    Boolean(analytics?.counts_by_status.QUEUED || analytics?.counts_by_status.PROCESSING);
  useEffect(() => {
    if (selectedDocId || !hasActiveJobs) return;
    let cancelled = false;
    let timer: number;
    const refreshQueue = async () => {
      await loadData();
      if (!cancelled) timer = window.setTimeout(refreshQueue, 2500);
    };
    timer = window.setTimeout(refreshQueue, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [hasActiveJobs, loadData, selectedDocId]);

  const handleSelectDocument = async (docId: string) => {
    const request = ++selectionRequest.current;
    currentDocumentId.current = docId;
    setSelectedDocId(docId);
    setSelectedDoc(null);
    setIsLoadingDoc(true);
    setDocumentError(false);
    setDocumentInUrl(docId);
    try {
      const detail = await fetchDocumentDetail(docId);
      if (request === selectionRequest.current) setSelectedDoc(detail);
    } catch (err) {
      console.error('Failed to fetch document detail:', err);
      if (request === selectionRequest.current) setDocumentError(true);
    } finally {
      if (request === selectionRequest.current) setIsLoadingDoc(false);
    }
  };

  useEffect(() => {
    const documentId = new URLSearchParams(window.location.search).get('document');
    if (documentId) void handleSelectDocument(documentId);
  }, []);

  const handleRefreshCurrent = async () => {
    if (selectedDocId && currentDocumentId.current === selectedDocId) {
      const request = selectionRequest.current;
      const detail = await fetchDocumentDetail(selectedDocId);
      if (request === selectionRequest.current) setSelectedDoc(detail);
    }
    if (currentDocumentId.current === selectedDocId) await loadData();
  };

  const handleJobUpdate = (job: WorkflowJob) => {
    if (currentDocumentId.current !== job.document_id || job.status === 'SUCCEEDED') return;
    const status = job.status;
    setSelectedDoc((previous) => {
      if (!previous || previous.id !== job.document_id) return previous;
      if (previous.job_id === job.id && previous.status === status) return previous;
      return { ...previous, job_id: job.id, status };
    });
    void loadData();
  };

  const handleBackToQueue = () => {
    ++selectionRequest.current;
    currentDocumentId.current = null;
    setSelectedDocId(null);
    setSelectedDoc(null);
    setIsLoadingDoc(false);
    setDocumentError(false);
    setDocumentInUrl(null);
    loadData();
  };

  const processingJobId = selectedDoc?.job_id && (
    isActiveProcessing(selectedDoc.status) || selectedDoc.status === 'FAILED' ||
    selectedDoc.status === 'CANCELLED'
  ) ? selectedDoc.job_id : null;

  const view = selectedDoc && processingJobId ? 'processing' : selectedDocId && selectedDoc ? 'detail' : isLoadingDoc ? 'loading' : documentError ? 'error' : 'dashboard';

  // Drop PDFs anywhere on the dashboard: the intake unit opens, loads them and feeds them straight in.
  useEffect(() => {
    if (view !== 'dashboard' || isUploadOpen) return;
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; depth++; setDragging(true); };
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const leave = (e: DragEvent) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) setDragging(false); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return; e.preventDefault(); depth = 0; setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []); if (files.length) { setDroppedFiles(files); setIsUploadOpen(true); }
    };
    window.addEventListener('dragenter', enter); window.addEventListener('dragover', over); window.addEventListener('dragleave', leave); window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragenter', enter); window.removeEventListener('dragover', over); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop); setDragging(false); };
  }, [view, isUploadOpen]);

  const openWithFolder = (id: string) => {
    if (settings.motion !== 'full') { void handleSelectDocument(id); return; }
    setCurtain({ id, name: documents.find((d) => d.id === id)?.filename ?? '' });
  };

  const pageMotion = {
    initial: { opacity: 0, y: 28, filter: 'blur(6px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease: EASE } },
    exit: { opacity: 0, y: -16, filter: 'blur(4px)', transition: { duration: 0.35, ease: EASE } },
  };

  const showArchive = (id: string) => {
    setActiveFilter(id);
    window.setTimeout(() => document.getElementById('archive')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  return (
    <ReadyContext.Provider value={ready}>
      <div className="grain relative flex min-h-screen flex-col bg-desk font-sans text-ink">
        <Navbar isRtl={isRtl} onToggleLanguage={() => setIsRtl(!isRtl)} onNewUpload={() => setIsUploadOpen(true)} onGoHome={handleBackToQueue} theme={theme} onToggleTheme={toggleTheme} soundOn={soundOn} onToggleSound={toggleSound} />

        <main className="relative z-10 mx-auto w-full max-w-[1400px] flex-1 px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
          <AnimatePresence mode="wait">
            {view === 'processing' && selectedDoc && processingJobId && (
              <motion.div key={`processing-${processingJobId}`} {...pageMotion}>
                <ProcessingStatus
                  document={selectedDoc} jobId={processingJobId} isRtl={isRtl}
                  onBack={handleBackToQueue} onRefresh={handleRefreshCurrent} onJobUpdate={handleJobUpdate} dark={dark} onFlight={startFlight}
                />
              </motion.div>
            )}
            {view === 'detail' && selectedDoc && (
              <motion.div key={`detail-${selectedDoc.id}`} {...pageMotion}>
                <DocumentDetail document={selectedDoc} onBack={handleBackToQueue} onRefresh={handleRefreshCurrent} isRtl={isRtl} flying={Boolean(flight) && !landed} />
              </motion.div>
            )}
            {view === 'loading' && (
              <motion.div key="loading" {...pageMotion} className="grid min-h-[50vh] place-items-center">
                <div className="w-64 text-center" role="status">
                  <p className="font-display text-3xl">{t('Pulling the file', 'جارٍ استخراج الملف')}</p>
                  <div className="mt-4 h-px w-full overflow-hidden bg-ink/15"><motion.div className="h-full w-1/3 bg-stamp" animate={{ x: ['-100%', '300%'] }} transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }} /></div>
                  <p className="label mt-3">{t('Loading invoice verification data...', 'جاري تحميل تفاصيل الفاتورة...')}</p>
                </div>
              </motion.div>
            )}
            {view === 'error' && (
              <motion.div key="error" {...pageMotion} className="mx-auto max-w-xl border-s-2 border-stamp bg-stamp-wash/70 p-6">
                <p role="alert" className="font-display text-3xl text-stamp-deep">{t('Could not open this document.', 'تعذر فتح المستند.')}</p>
                <button type="button" onClick={handleBackToQueue} className="btn-line mt-5">{t('Back to documents', 'العودة إلى قائمة المستندات')}</button>
              </motion.div>
            )}
            {view === 'dashboard' && (
              <motion.div key="dashboard" {...pageMotion} className="space-y-16 sm:space-y-24">
                <section className="relative z-20 grid items-center gap-12 lg:grid-cols-[1.5fr_1fr]">
                  <motion.div style={{ y: heroY }}>
                    <h1 className="font-display text-[clamp(52px,9vw,132px)] leading-[.9] tracking-[-0.02em]">
                      {isRtl ? (
                        <>
                          <Rise delay={0.15}>كل فاتورة،</Rise><br />
                          <Rise delay={0.3} className="text-stamp">تُقرأ وتُطابق</Rise><br />
                          <Rise delay={0.45}>قبل أن تُحفظ.</Rise>
                        </>
                      ) : (
                        <>
                          <Rise delay={0.15}>Every invoice,</Rise><br />
                          <Rise delay={0.3} className="italic text-stamp">read and reconciled</Rise><br />
                          <Rise delay={0.45}>before it is filed.</Rise>
                        </>
                      )}
                    </h1>
                    <DrawRule className="mt-10 max-w-[28rem]" delay={0.9} />
                    <p className="mt-6 max-w-[34rem] text-[17px] leading-relaxed text-ink-soft">
                      {t('Drop a PDF and watch the intake unit draw it in. Then check every extracted field against the exact spot on the page it came from, correct what is wrong, and approve with a full audit trail.',
                        'ارفع ملف PDF وشاهد جهاز الاستلام يسحبه. ثم قارن كل حقل مستخرج بموضعه في الصفحة، وصحّح ما يلزم، واعتمد مع سجل تدقيق كامل.')}
                    </p>
                    <div className="mt-9 flex flex-wrap items-center gap-4">
                      <Magnetic><button type="button" onClick={() => setIsUploadOpen(true)} className="btn-ink !px-7 !py-4 !text-[14px]"><span>{t('Feed an invoice', 'ارفع فاتورة')}</span></button></Magnetic>
                      <button type="button" onClick={() => showArchive('ALL')} className="group inline-flex items-center gap-2 text-[14px] font-semibold">
                        <span className="relative">{t('Open the archive', 'افتح الأرشيف')}<span className="absolute -bottom-1 start-0 h-px w-full origin-left bg-ink transition-transform duration-500 ease-paper group-hover:scale-x-0 rtl:origin-right" /></span>
                        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 rotate-90" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M2 8h11M9 3.5 13.5 8 9 12.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                    </div>
                  </motion.div>
                  <motion.div className="relative z-20" style={{ y: receiptY, rotate: receiptRot, scale: receiptScale }}>
                    <OverviewStats analytics={analytics} isRtl={isRtl} activeFilter={activeFilter} onFilter={showArchive} theme={theme} />
                  </motion.div>
                </section>

                <div className="relative z-10 -mx-4 border-y border-ink/80 py-5 sm:-mx-8" aria-hidden>
                  <Marquee reverse={isRtl} items={['Tax invoice', 'فاتورة ضريبية', 'VAT 15%', 'ضريبة القيمة المضافة', 'Line by line', 'سطر بسطر', 'Evidence on the page', 'الدليل في الصفحة']} />
                </div>

                <div id="archive" className="scroll-mt-24">
                  <DocumentQueue documents={documents} activeFilter={activeFilter} onFilterChange={setActiveFilter} onSelectDocument={openWithFolder} isRtl={isRtl} loaded={loaded} onFeed={() => setIsUploadOpen(true)} suspendMachine={isUploadOpen} dark={dark} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <InfiniteFooter
          isRtl={isRtl}
          reduceMotion={settings.motion !== 'full' || view !== 'dashboard'}
          loop={view === 'dashboard'}
          theme={theme}
          scrollToTop={() => {
            if (lenisRef.current) {
              lenisRef.current.scrollTo(0, { immediate: true });
            } else {
              window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
            }
          }}
        />

        <UploadModal
          isOpen={isUploadOpen}
          onClose={closeUpload}
          onUploadSuccess={(newId) => { void handleSelectDocument(newId); void loadData(); }}
          isRtl={isRtl}
          dark={dark}
          initialFiles={droppedFiles}
          onConsumeInitial={() => setDroppedFiles(undefined)}
          onBatchDone={() => { void loadData(); showArchive('ALL'); }}
        />
        <InkFilters />
        <Cursor enabled={(view === 'dashboard' || view === 'detail') && !isUploadOpen && !booting} label={t('View', 'عرض')} />
        <AnimatePresence>
          {dragging && (
            <motion.div key="drop" className="pointer-events-none fixed inset-0 z-[80] grid place-items-center bg-desk/85 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div initial={{ y: 30, rotate: -4 }} animate={{ y: [0, -12, 0], rotate: -2 }} transition={{ y: { repeat: Infinity, duration: 1.8, ease: 'easeInOut' } }} className="edge-zig-bottom bg-paper px-10 pb-14 pt-8 text-center shadow-sheet">
                <p className="label">{t('Intake', 'الاستلام')}</p>
                <p className="mt-2 font-display text-[44px] leading-none">{t('Release to feed the intake unit', 'أفلت لتغذية جهاز الاستلام')}</p>
                <p className="label mt-3">{t('PDF invoices', 'فواتير PDF')}</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        {curtain && <FolderCurtain name={curtain.name} onCovered={() => { void handleSelectDocument(curtain.id); }} onDone={() => setCurtain(null)} />}
        <div className="lamp" aria-hidden />
        {flight && <PaperFlight info={flight} onLand={() => setLanded(true)} onDone={() => setFlight(null)} />}
      </div>
      {booting && <BootScreen onReveal={revealApp} onDone={finishBoot} />}
    </ReadyContext.Provider>
  );
};

function setDocumentInUrl(documentId: string | null) {
  const url = new URL(window.location.href);
  if (documentId) {
    url.searchParams.set('document', documentId);
  } else {
    url.searchParams.delete('document');
  }
  window.history.replaceState(null, '', url);
}
