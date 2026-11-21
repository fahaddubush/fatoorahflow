import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { correctField, fetchAuditTrail, getPageImageUrl, ReviewApiError, submitDecision } from '../api/client';
import { AuditEvent, DocumentDetail as DocDetailType, LineItem, ValidationFinding } from '../types';
import { EASE, Reveal, StatusStamp, Typewriter } from './ui';
import { sound } from '../lib/sound';
import { InkStamp } from './Ink';

const fieldDomId = (path: string) => `field-${path.replace(/[^a-z0-9]/gi, '_')}`;

interface DocumentDetailProps {
  document: DocDetailType;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  isRtl: boolean;
  /** True while the ejected sheet is still flying in; the page image waits for it to land. */
  flying?: boolean;
}

interface ReviewField {
  path: string;
  label: string;
  value: string | null | undefined;
  nullable?: boolean;
}

type Decision = 'APPROVE' | 'REJECT';

function displayValue(value: unknown): string {
  if (value == null || value === '') return '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

const markerSweep = 'bg-[linear-gradient(#F4DF4E,#F4DF4E)] bg-[length:0%_42%] bg-left-bottom bg-no-repeat transition-[background-size] duration-500 ease-paper hover:bg-[length:100%_42%] rtl:bg-right-bottom';

function useEscape(active: boolean, close: () => void) {
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [active, close]);
}

function SectionTitle({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-baseline gap-3 border-b border-ink/80 pb-2">
      <span className="font-mono text-[11px] text-stamp">{n}</span>
      <h3 className="font-display text-[28px] leading-none">{children}</h3>
    </div>
  );
}

export const DocumentDetail: React.FC<DocumentDetailProps> = ({ document: doc, onBack, onRefresh, isRtl, flying }) => {
  const flyAtMount = React.useRef(Boolean(flying)).current;
  const t = (en: string, ar: string) => (isRtl ? ar : en);
  const [activeField, setActiveField] = useState<string | null>(null);
  const [pageNo, setPageNo] = useState(doc.pages[0]?.page_no ?? 1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [editingField, setEditingField] = useState<ReviewField | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editReason, setEditReason] = useState('');
  const [pendingDecision, setPendingDecision] = useState<Decision | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [working, setWorking] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [recheckFindings, setRecheckFindings] = useState<ValidationFinding[] | null>(null);
  const [showAuditDrawer, setShowAuditDrawer] = useState(false);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState(false);
  const [justDecided, setJustDecided] = useState<Decision | null>(null);
  const shake = useAnimationControls();
  const [notes, setNotes] = useState<Record<string, string>>(() => { try { return JSON.parse(localStorage.getItem(`ff-notes-${doc.id}`) || '{}'); } catch { return {}; } });
  const [noteEditing, setNoteEditing] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [showKeys, setShowKeys] = useState(false);
  const [justCorrected, setJustCorrected] = useState<{ path: string; from: string; to: string; at: number } | null>(null);

  const extraction = doc.extraction;
  const findings = recheckFindings ?? doc.findings;
  const revisionNo = doc.review_task?.revision_no;
  const canReview = doc.review_task?.status === 'PENDING' && (doc.status === 'READY_FOR_REVIEW' || doc.status === 'NEEDS_REVIEW');
  const hasBlockers = findings.some((finding) => finding.severity === 'blocking');
  const requiresReviewReason = findings.some((finding) => finding.severity === 'review_required');
  const activeBBoxes = (activeField ? doc.evidence[activeField] ?? [] : []).filter((box) => box.page === pageNo);
  const qrFindings = findings.filter((finding) => finding.rule_id.includes('-QR-'));
  const qrFromImage = doc.evidence.qr?.some((box) => box.engine === 'zxingcpp');
  const qrSummary = extraction?.qr.decode_status === 'decoded_tlv' && qrFromImage
    ? (qrFindings.length
      ? t('QR decoded. See findings for base-tag comparisons.', 'تم فك رمز الاستجابة السريعة. راجع ملاحظات مطابقة الحقول الأساسية.')
      : t('QR base tags match the invoice.', 'تتطابق حقول الرمز الأساسية مع الفاتورة.'))
    : t('QR base tags were not verified.', 'لم يتم التحقق من حقول الرمز الأساسية.');

  function selectEvidence(fieldPath: string) {
    sound.click();
    setActiveField(fieldPath);
    const box = doc.evidence[fieldPath]?.find((item) => doc.pages.some((page) => page.page_no === item.page));
    if (box) setPageNo(box.page);
  }

  function startEdit(field: ReviewField) {
    if (!canReview || refreshRequired) return;
    selectEvidence(field.path);
    setReviewError(null);
    setEditingField(field);
    setEditValue(field.value ?? '');
    setEditReason('');
  }

  async function refreshReview() {
    setRefreshRequired(true);
    try {
      await onRefresh();
      setRecheckFindings(null);
      setRefreshRequired(false);
    } catch {
      setReviewError(t('Could not refresh this invoice. Refresh it before submitting another change.', 'تعذر تحديث الفاتورة. حدّثها قبل إرسال أي تغيير آخر.'));
    }
  }

  async function handleReviewError(error: unknown, fallback: string) {
    if (error instanceof ReviewApiError && error.status === 409) {
      setEditingField(null);
      setPendingDecision(null);
      setReviewError(t('This review changed. Inspect the refreshed revision before resubmitting.', 'تم تغيير هذه المراجعة. افحص الإصدار المحدّث قبل إعادة الإرسال.'));
      await refreshReview();
      return;
    }
    if (error instanceof ReviewApiError && error.findings) setRecheckFindings(error.findings);
    setReviewError(error instanceof Error ? error.message : fallback);
  }

  async function saveCorrection(event: React.FormEvent) {
    event.preventDefault();
    if (!editingField || revisionNo === undefined || working || refreshRequired) return;
    const value = editValue.trim();
    if ((!value && !editingField.nullable) || !editReason.trim()) return;
    setWorking(true);
    setReviewError(null);
    try {
      await correctField(doc.id, editingField.path, value || null, revisionNo, editReason.trim());
      const at = Date.now();
      setJustCorrected({ path: editingField.path, from: displayValue(editingField.value), to: value, at });
      window.setTimeout(() => setJustCorrected((c) => (c && c.at === at ? null : c)), 4800);
      sound.ping();
      setEditingField(null);
      await refreshReview();
    } catch (error) {
      await handleReviewError(error, t('Correction failed.', 'تعذر حفظ التصحيح.'));
    } finally {
      setWorking(false);
    }
  }

  async function decide(action: Decision, reason: string) {
    if (!canReview || revisionNo === undefined || working || refreshRequired) return;
    if (action === 'APPROVE' && hasBlockers) return;
    setWorking(true);
    setReviewError(null);
    try {
      await submitDecision(doc.id, action, reason, revisionNo);
      setPendingDecision(null);
      setJustDecided(action);
      await refreshReview();
    } catch (error) {
      await handleReviewError(error, t('Decision could not be saved.', 'تعذر حفظ القرار.'));
    } finally {
      setWorking(false);
    }
  }

  function startDecision(action: Decision) {
    if (action === 'REJECT' || requiresReviewReason) {
      setReviewError(null);
      setDecisionReason('');
      setPendingDecision(action);
    } else {
      void decide(action, '');
    }
  }

  async function openAudit() {
    setShowAuditDrawer(true);
    setAuditLoading(true);
    setAuditError(false);
    setAuditEvents([]);
    try {
      setAuditEvents(await fetchAuditTrail(doc.id));
    } catch {
      setAuditError(true);
    } finally {
      setAuditLoading(false);
    }
  }

  useEscape(Boolean(editingField) && !working, () => setEditingField(null));
  useEscape(Boolean(pendingDecision) && !working, () => setPendingDecision(null));
  useEscape(showAuditDrawer, () => setShowAuditDrawer(false));

  function openNote(path: string) { setNoteEditing(path); setNoteDraft(notes[path] ?? ''); }
  function saveNote(path: string) {
    const text = noteDraft.trim(); const next = { ...notes };
    if (text) next[path] = text; else delete next[path];
    setNotes(next); setNoteEditing(null); sound.clip();
    try { localStorage.setItem(`ff-notes-${doc.id}`, JSON.stringify(next)); } catch { /* storage unavailable: note stays for this session */ }
  }

  function renderField(field: ReviewField, opts: { large?: boolean } = {}) {
    const matchingFindings = findings.filter((finding) => finding.field_paths.includes(field.path));
    const hasEvidence = Boolean(doc.evidence[field.path]?.length);
    const active = activeField === field.path;
    const flagged = matchingFindings.length > 0;
    const fresh = justCorrected?.path === field.path ? justCorrected : null;
    const sizeCls = opts.large ? 'font-display text-[34px] leading-none' : 'text-[17px]';
    return (
      <div key={field.path} id={fieldDomId(field.path)} className={`group relative min-w-0 border-t py-3 ps-3 transition-colors duration-500 ${active ? 'border-stamp bg-marker/30' : 'border-ink/15'}`}>
        <span className={`absolute inset-y-0 start-0 w-[3px] origin-top transition-transform duration-500 ease-paper ${active ? 'scale-y-100 bg-stamp' : flagged ? 'scale-y-100 bg-manila-shade' : 'scale-y-0 bg-stamp'}`} />
        <div className="flex items-center justify-between gap-2">
          <span className="label">{field.label}</span>
          <span className="flex items-center gap-3">
          <button type="button" data-cursor="pen" onClick={() => openNote(field.path)}
            title={notes[field.path] ? `${t('Edit note for', 'تعديل ملاحظة')} ${field.label}` : `${t('Add note to', 'إضافة ملاحظة إلى')} ${field.label}`}
            aria-label={notes[field.path] ? `${t('Edit note for', 'تعديل ملاحظة')} ${field.label}` : `${t('Add note to', 'إضافة ملاحظة إلى')} ${field.label}`}
            className="inline-flex items-center font-mono text-[10px] caps tracking-label text-ink-mute opacity-70 transition hover:text-carbon group-hover:opacity-100"
          >
            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 2.5h7l3 3V13.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z" />
              <path d="M10 2.5v3h3" />
              <path d="M5 8.5h6M5 11h4" />
            </svg>
          </button>
          {canReview && (
            <button data-cursor="pen"
              type="button" title={`${t('Correct', 'تصحيح')} ${field.label}`} aria-label={`${t('Correct', 'تصحيح')} ${field.label}`}
              onClick={() => startEdit(field)} disabled={working || refreshRequired}
              className="inline-flex items-center font-mono text-[10px] caps tracking-label text-ink-mute opacity-70 transition hover:text-stamp group-hover:opacity-100 disabled:opacity-30"
            >
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M2.5 13.5l.6-3L11 2.6a1.4 1.4 0 0 1 2 2L5.1 12.5z" strokeLinejoin="round" /></svg>
            </button>
          )}
          </span>
        </div>
        {noteEditing === field.path && (
          <div className="mt-2">
            <textarea autoFocus rows={2} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder={t('Margin note for this field…', 'ملاحظة على هامش هذا الحقل…')}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNote(field.path); if (e.key === 'Escape') setNoteEditing(null); }}
              className="field-input resize-none font-hand !text-[20px] leading-tight text-carbon" />
            <div className="mt-2 flex gap-3 font-mono text-[10.5px] caps tracking-label">
              <button type="button" onClick={() => saveNote(field.path)} className="text-ink underline underline-offset-4 hover:text-stamp">{t('Pin note', 'تثبيت الملاحظة')}</button>
              <button type="button" onClick={() => setNoteEditing(null)} className="text-ink-mute hover:text-ink">{t('Cancel', 'إلغاء')}</button>
            </div>
          </div>
        )}
        {notes[field.path] && noteEditing !== field.path && <p className="mt-1 -rotate-1 font-hand text-[21px] leading-tight text-carbon">{notes[field.path]}</p>}
        {fresh && <motion.span key={fresh.at} aria-hidden className="pointer-events-none absolute inset-0 bg-marker/60" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 1.8, ease: EASE }} />}
        {fresh ? (
          <div className="relative mt-1">
            <motion.p initial={{ opacity: 1 }} animate={{ opacity: 0.55 }} transition={{ duration: 0.8 }} className="font-mono text-[11px] text-ink-mute line-through decoration-stamp decoration-2" dir="ltr">{fresh.from}</motion.p>
            <Typewriter text={displayValue(field.value)} trigger={fresh.at} className={`block break-words font-medium leading-snug ${sizeCls}`} />
          </div>
        ) : hasEvidence ? (
          <button
            type="button" data-cursor="pen" onClick={() => selectEvidence(field.path)} title={t('Show source evidence', 'عرض الدليل في المستند')}
            aria-label={`${t('Show evidence for', 'عرض دليل')} ${field.label}`}
            className={`mt-1 max-w-full break-words text-start font-medium leading-snug ${opts.large ? 'font-display text-[34px] leading-none' : 'text-[17px]'} ${markerSweep}`}
          >
            {displayValue(field.value)}
          </button>
        ) : (
          <p className={`mt-1 break-words font-medium leading-snug ${opts.large ? 'font-display text-[34px] leading-none' : 'text-[17px]'}`}>{displayValue(field.value)}</p>
        )}
        {matchingFindings.map((finding, index) => (
          <p key={`${finding.rule_id}-${index}`} title={finding.rule_id} className={`mt-2 text-[12.5px] leading-snug ${finding.severity === 'blocking' ? 'text-stamp-deep' : 'text-manila-shade'}`}>
            {finding.explanation}
          </p>
        ))}
      </div>
    );
  }

  const coreFields: ReviewField[] = [
    { path: 'invoice_number', label: t('Invoice Number', 'رقم الفاتورة'), value: extraction?.invoice_number, nullable: true },
    { path: 'issue_date', label: t('Issue Date', 'تاريخ الإصدار'), value: extraction?.issue_date, nullable: true },
    { path: 'issue_time', label: t('Issue Time', 'وقت الإصدار'), value: extraction?.issue_time, nullable: true },
    { path: 'currency', label: t('Currency', 'العملة'), value: extraction?.currency },
    { path: 'seller.legal_name', label: t('Seller Name', 'اسم البائع'), value: extraction?.seller.legal_name, nullable: true },
    { path: 'seller.vat_registration_number', label: t('Seller VAT ID', 'الرقم الضريبي للبائع'), value: extraction?.seller.vat_registration_number, nullable: true },
  ];
  if (extraction?.buyer || extraction?.document_type === 'tax_invoice') {
    coreFields.push(
      { path: 'buyer.legal_name', label: t('Buyer Name', 'اسم المشتري'), value: extraction?.buyer?.legal_name, nullable: true },
      { path: 'buyer.vat_registration_number', label: t('Buyer VAT ID', 'الرقم الضريبي للمشتري'), value: extraction?.buyer?.vat_registration_number, nullable: true },
    );
  }
  const totalFields: ReviewField[] = [
    { path: 'subtotal', label: t('Subtotal', 'المجموع الفرعي'), value: extraction?.subtotal, nullable: true },
    { path: 'discount_total', label: t('Discount Total', 'إجمالي الخصم'), value: extraction?.discount_total },
    { path: 'vat_total', label: t('VAT Total', 'إجمالي الضريبة'), value: extraction?.vat_total, nullable: true },
    { path: 'grand_total', label: t('Grand Total', 'الإجمالي الكلي'), value: extraction?.grand_total, nullable: true },
  ];
  const lineFields: [keyof LineItem, string][] = [
    ['description', t('Description', 'الوصف')],
    ['quantity', t('Quantity', 'الكمية')],
    ['unit_price', t('Unit Price', 'سعر الوحدة')],
    ['discount_amount', t('Discount', 'الخصم')],
    ['tax_rate', t('VAT Rate (e.g. 0.15)', 'نسبة الضريبة (مثل 0.15)')],
    ['line_subtotal', t('Line Subtotal', 'المجموع الفرعي للبند')],
    ['line_tax', t('Line VAT', 'ضريبة البند')],
    ['line_total', t('Line Total', 'إجمالي البند')],
  ];

  // keyboard review flow: J/K move between fields, E correct, N note, A approve, R reject, ? help
  const navFields: ReviewField[] = [...coreFields, ...totalFields, ...(extraction?.line_items ?? []).flatMap((item, index) => lineFields.map(([key, label]) => ({ path: `line_items[${index}].${key}`, label: `${label} ${index + 1}`, value: item[key] as string })))];
  const keyHandler = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    if (el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)) return;
    if (editingField || pendingDecision || showAuditDrawer || noteEditing) return;
    const k = e.key.toLowerCase(); const idx = navFields.findIndex((f) => f.path === activeField);
    if (k === 'j' || k === 'k') {
      e.preventDefault(); if (!navFields.length) return;
      const next = idx < 0 ? (k === 'j' ? 0 : navFields.length - 1) : (idx + (k === 'j' ? 1 : -1) + navFields.length) % navFields.length;
      selectEvidence(navFields[next].path); document.getElementById(fieldDomId(navFields[next].path))?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else if (k === 'e' && idx >= 0) { e.preventDefault(); startEdit(navFields[idx]); }
    else if (k === 'n' && idx >= 0) { e.preventDefault(); openNote(navFields[idx].path); }
    else if (k === 'a' && canReview && !hasBlockers) { e.preventDefault(); startDecision('APPROVE'); }
    else if (k === 'r' && canReview) { e.preventDefault(); startDecision('REJECT'); }
    else if (e.key === '?') setShowKeys((v) => !v);
    else if (e.key === 'Escape') setShowKeys(false);
  };
  const keyRef = React.useRef(keyHandler); keyRef.current = keyHandler;
  useEffect(() => { const f = (e: KeyboardEvent) => keyRef.current(e); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, []);

  const sevStyle = (s: ValidationFinding['severity']) =>
    s === 'blocking' ? 'border-stamp bg-stamp-wash' : s === 'review_required' ? 'border-manila-shade bg-marker/45' : 'border-ink/25 bg-paper-warm';
  const sevLabel = (s: ValidationFinding['severity']) =>
    ({ blocking: t('Blocking', 'مانع'), review_required: t('Check', 'مراجعة'), warning: t('Warning', 'تحذير'), info: t('Note', 'ملاحظة') })[s];
  const sevTone = (s: ValidationFinding['severity']) => (s === 'blocking' ? 'border-stamp text-stamp' : s === 'review_required' ? 'border-manila-shade text-manila-shade' : 'border-ink-mute text-ink-mute');

  const decided = doc.status === 'APPROVED' || doc.status === 'REJECTED';

  return (
    <div className="pb-28">
      <Reveal>
        <button type="button" onClick={onBack} aria-label={t('Back to documents', 'العودة إلى المستندات')} className="group inline-flex items-center gap-2 font-mono text-[11px] caps tracking-label text-ink-soft hover:text-ink">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 transition-transform duration-500 ease-paper group-hover:-translate-x-1 rtl:rotate-180 rtl:group-hover:translate-x-1" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M14 8H3M7 3.5 2.5 8 7 12.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {t('The archive', 'الأرشيف')}
        </button>
      </Reveal>

      <Reveal delay={0.05} className="mt-4 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <h2 className="break-words font-display text-[clamp(36px,5vw,64px)] leading-[.95]"><bdi>{doc.filename}</bdi></h2>
          <p className="mt-3 flex flex-wrap items-center gap-3">
            <StatusStamp status={doc.status} isRtl={isRtl} />
          </p>
        </div>
        <button type="button" onClick={openAudit} className="btn-line">{t('Audit Trail', 'سجل التدقيق')}</button>
      </Reveal>

      {canReview && hasBlockers && (
        <p className="mt-6 border-s-2 border-stamp bg-stamp-wash/70 px-4 py-3 text-[14px] text-stamp-deep">
          {t('Resolve blocking findings before approving this invoice.', 'يجب حل الملاحظات المانعة قبل اعتماد هذه الفاتورة.')}
        </p>
      )}
      {reviewError && !editingField && !pendingDecision && (
        <div role="alert" className="mt-6 flex flex-wrap items-center gap-3 border-s-2 border-stamp bg-stamp-wash/70 px-4 py-3 text-[14px] text-stamp-deep">
          <span>{reviewError}</span>
          {refreshRequired && !working && <button type="button" onClick={refreshReview} className="btn-line !px-3 !py-1.5 !text-[12px]">{t('Refresh invoice', 'تحديث الفاتورة')}</button>}
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-[1.02fr_1fr] xl:gap-12">
        {/* ---------- the desk: original document with evidence ---------- */}
        <Reveal delay={0.12} className="min-w-0 lg:sticky lg:top-[88px]">
          <section aria-label={t('Original Document Evidence', 'صورة المستند الأصلي')} className="rounded-[18px] bg-desk-deep p-3 sm:p-4" style={{ boxShadow: 'inset 0 2px 10px rgba(60,42,12,.18), inset 0 0 0 1px rgba(21,18,14,.06)' }}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-3">
              <h3 className="label !text-ink">{t('Original Document Evidence', 'صورة المستند الأصلي')}</h3>
              <div className="flex items-center gap-2 font-mono text-[11px]">
                {doc.pages.length > 1 && (
                  <label className="me-2 flex items-center gap-1.5 text-ink-soft">
                    {t('Page', 'الصفحة')}
                    <select value={pageNo} onChange={(event) => setPageNo(Number(event.target.value))} className="rounded border border-ink/25 bg-paper px-1.5 py-1">
                      {doc.pages.map((page) => <option key={page.page_no} value={page.page_no}>{page.page_no}</option>)}
                    </select>
                  </label>
                )}
                <button type="button" aria-label={t('Zoom out', 'تصغير')} onClick={() => setZoomLevel((zoom) => Math.max(0.7, +(zoom - 0.1).toFixed(2)))} className="grid h-7 w-7 place-items-center rounded-full border border-ink/25 transition hover:bg-inkbg hover:text-onink">−</button>
                <span className="w-10 text-center tabular-nums">{(zoomLevel * 100).toFixed(0)}%</span>
                <button type="button" aria-label={t('Zoom in', 'تكبير')} onClick={() => setZoomLevel((zoom) => Math.min(1.5, +(zoom + 0.1).toFixed(2)))} className="grid h-7 w-7 place-items-center rounded-full border border-ink/25 transition hover:bg-inkbg hover:text-onink">+</button>
              </div>
            </div>
            {doc.pages.length ? (
              <div data-lenis-prevent className="max-h-[calc(100vh-210px)] min-h-[320px] overflow-auto rounded-[10px] p-2 sm:p-4" dir="ltr">
                <motion.div animate={shake}>
                <motion.div
                  id="paper-target" className="paper-ink relative mx-auto origin-top shadow-sheet" style={{ width: `${zoomLevel * 100}%` }}
                  initial={flyAtMount ? { opacity: 0, rotate: 0, y: 0 } : { rotate: -1.4, y: 30, opacity: 0 }} animate={{ rotate: 0, y: 0, opacity: flying ? 0 : 1 }} transition={{ duration: flyAtMount ? 0.5 : 1.1, ease: EASE, delay: flyAtMount ? 0 : 0.3 }}
                >
                  <img key={pageNo} src={getPageImageUrl(doc.id, pageNo, extraction?.tenant_id)} alt={`${t('Document Page', 'صفحة المستند')} ${pageNo}`} className="block h-auto w-full bg-paper" />
                  <AnimatePresence>
                    {activeBBoxes.map((box, index) => {
                      const [ymin, xmin, ymax, xmax] = box.bbox;
                      return (
                        <motion.div
                          key={`${activeField}-${index}`} aria-hidden="true" className="pointer-events-none absolute"
                          style={{ top: `${ymin * 100}%`, left: `${xmin * 100}%`, width: `${(xmax - xmin) * 100}%`, height: `${(ymax - ymin) * 100}%` }}
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
                        >
                          <motion.span className="absolute inset-0 origin-left bg-marker/55 mix-blend-multiply" style={{ filter: 'url(#marker-wobble)' }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.7, ease: EASE }} />
                          <motion.span className="absolute inset-x-0 -bottom-[2px] h-[2.5px] origin-left bg-stamp" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, ease: EASE, delay: 0.12 }} />
                          <motion.span className="absolute -inset-[5px] border border-stamp/70" initial={{ opacity: 0, scale: 1.4 }} animate={{ opacity: [0, 1, 0.5], scale: 1 }} transition={{ duration: 0.8, ease: EASE, delay: 0.1 }} />
                          <span className="absolute -top-[22px] start-[-5px] bg-ink px-1.5 py-[3px] font-mono text-[9px] leading-none tracking-wide text-paper">{activeField}</span>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                  {decided && (
                    <InkStamp kind={doc.status === 'APPROVED' ? 'APPROVED' : 'REJECTED'} label={doc.status === 'APPROVED' ? t('APPROVED', 'معتمدة') : t('REJECTED', 'مرفوضة')} animate={Boolean(justDecided)}
                      onImpact={(heavy) => void shake.start({ x: heavy ? [0, -10, 8, -5, 3, 0] : [0, -5, 4, -2, 1, 0], y: heavy ? [0, 7, -5, 3, -1, 0] : [0, 4, -2, 1, 0, 0], transition: { duration: heavy ? 0.6 : 0.45 } })} />
                  )}
                  {Object.entries(notes).map(([path, text]) => {
                    const box = doc.evidence[path]?.find((b) => b.page === pageNo); if (!box) return null;
                    const [ymin, xmin, , xmax] = box.bbox; const right = xmax < 0.6;
                    return (
                      <motion.div key={`note-${path}`} aria-hidden className="pointer-events-none absolute font-hand text-carbon" style={{ top: `${ymin * 100 - 0.5}%`, maxWidth: '31%', ...(right ? { left: `${xmax * 100 + 5}%` } : { right: `${(1 - xmin) * 100 + 5}%` }) }}
                        initial={{ opacity: 0, rotate: -7, x: right ? -10 : 10 }} animate={{ opacity: 1, rotate: -2.5, x: 0 }} transition={{ duration: 0.8, ease: EASE }}>
                        <svg viewBox="0 0 44 22" className={`absolute top-1 h-5 w-11 ${right ? 'right-full me-1' : 'left-full ms-1 -scale-x-100'}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M42 12C30 2 16 20 4 9" /><path d="M10 4 4 9 11 13" /></svg>
                        <span className="block text-[clamp(13px,1.7vw,21px)] leading-[1.05]" style={{ filter: 'url(#marker-wobble)', textShadow: '0 0 5px rgba(255,255,255,.95), 0 0 2px rgba(255,255,255,.9)' }}>{text}</span>
                      </motion.div>
                    );
                  })}
                </motion.div>
                </motion.div>
              </div>
            ) : (
              <p className="p-6 text-sm text-ink-soft">{t('No page image available.', 'لا تتوفر صورة للصفحة.')}</p>
            )}
          </section>
        </Reveal>

        {/* ---------- the folder: findings and fields ---------- */}
        <div className="min-w-0 space-y-12">
          <Reveal delay={0.2}>
            <section>
              <SectionTitle n={String(findings.length).padStart(2, '0')}>{t('Rule Validation Findings', 'نتائج التحقق من القواعد')}</SectionTitle>
              {findings.length === 0 ? (
                <div className="flex items-center gap-4 border border-dashed border-ledger/60 bg-ledger-wash/50 px-5 py-5">
                  <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0 text-ledger" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                    <circle cx="20" cy="20" r="17" /><motion.path d="M11.5 20.5l6 6 11-12" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, delay: 0.6, ease: EASE }} />
                  </svg>
                  <p className="font-display text-[26px] leading-tight text-ledger-deep">{t('No findings under the recorded policy.', 'لا توجد ملاحظات وفق السياسة المسجلة.')}</p>
                </div>
              ) : (
                <ul className="space-y-4">
                  <AnimatePresence mode="popLayout">
                  {findings.map((finding, index) => (
                    <motion.li
                      layout key={`${finding.rule_id}-${finding.field_paths.join(',')}`}
                      initial={{ opacity: 0, y: 24, rotate: 0 }} animate={{ opacity: 1, y: 0, rotate: index % 2 ? 0.5 : -0.5 }} whileHover={{ rotate: 0 }}
                      exit={{ opacity: 0, x: isRtl ? -120 : 120, y: -50, rotate: isRtl ? -16 : 16, transition: { duration: 0.8, ease: EASE } }}
                      style={{ transformOrigin: isRtl ? 'top left' : 'top right' }}
                      transition={{ duration: 0.8, ease: EASE, delay: 0.3 + index * 0.1 }}
                      className={`relative border-s-4 px-5 py-4 shadow-sheet ${sevStyle(finding.severity)}`}
                    >
                      <svg viewBox="0 0 20 44" className="absolute -top-3 end-6 h-9 w-4 text-ink-mute" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M6 36V8a4 4 0 0 1 8 0v26a2.5 2.5 0 0 1-5 0V12" strokeLinecap="round" /></svg>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="break-all font-mono text-[11px] font-medium" dir="ltr">{finding.rule_id}</span>
                        <span className={`stamp ${sevTone(finding.severity)}`}>{sevLabel(finding.severity)}</span>
                      </div>
                      <p className="mt-2 text-[15px] leading-snug">{finding.explanation}</p>
                      {finding.expected != null && finding.observed != null && typeof finding.expected !== 'object' && typeof finding.observed !== 'object' && (
                        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12px]" dir="ltr">
                          <span className="text-ink-mute line-through decoration-stamp decoration-2">{displayValue(finding.observed)}</span>
                          <span aria-hidden>→</span>
                          <span className="font-medium">{displayValue(finding.expected)}</span>
                        </p>
                      )}
                      {finding.field_paths.filter((path) => doc.evidence[path]?.length).map((path) => (
                        <button type="button" key={path} onClick={() => selectEvidence(path)} className="me-4 mt-3 inline-block break-all font-mono text-[10.5px] caps tracking-label underline decoration-ink/40 underline-offset-4 transition hover:decoration-stamp">
                          {t('Evidence', 'الدليل')} · {path}
                        </button>
                      ))}
                    </motion.li>
                  ))}
                  </AnimatePresence>
                </ul>
              )}
              {extraction?.qr && (
                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-dashed border-ink/30 pt-4 text-[13px] text-ink-soft">
                  <p>{qrSummary}</p>
                  {doc.evidence.qr?.length > 0 && (
                    <button type="button" onClick={() => selectEvidence('qr')} className="font-mono text-[10.5px] caps tracking-label text-ink underline decoration-ink/40 underline-offset-4 hover:decoration-stamp">
                      {t('Show QR evidence', 'عرض دليل رمز الاستجابة السريعة')}
                    </button>
                  )}
                </div>
              )}
            </section>
          </Reveal>

          {extraction && (
            <>
              <Reveal inView>
                <section>
                  <SectionTitle n="A">{t('Core Invoice Identifiers', 'البيانات الأساسية للفاتورة')}</SectionTitle>
                  <div className="grid gap-x-8 sm:grid-cols-2">{coreFields.map((f) => renderField(f))}</div>
                </section>
              </Reveal>

              <Reveal inView>
                <section>
                  <SectionTitle n="B">{t('Financial Reconciliation', 'المطابقة الحسابية')}</SectionTitle>
                  <div className="edge-zig-bottom bg-paper px-5 pb-10 pt-3 shadow-sheet sm:px-7" style={{ filter: 'drop-shadow(0 16px 20px rgba(60,42,12,.2))' }}>
                    <div className="grid gap-x-8 sm:grid-cols-2">
                      {totalFields.slice(0, 3).map((f) => renderField(f))}
                    </div>
                    <div className="mt-2">{renderField(totalFields[3], { large: true })}</div>
                  </div>
                </section>
              </Reveal>

              <Reveal inView>
                <section>
                  <SectionTitle n="C">{t('Line Items', 'بنود الفاتورة')}</SectionTitle>
                  {extraction.line_items.length === 0 && <p className="text-sm text-ink-soft">{t('No line items were extracted.', 'لم يتم استخراج أي بنود.')}</p>}
                  <div className="divide-y divide-ink/15 border-y border-ink/15">
                    {extraction.line_items.map((item, index) => (
                      <details key={index} open={findings.some((finding) => finding.field_paths.some((path) => path.startsWith(`line_items[${index}]`))) || undefined} className="group/line">
                        <summary className="flex cursor-pointer list-none items-baseline gap-3 py-4 [&::-webkit-details-marker]:hidden">
                          <span className="font-mono text-[11px] text-ink-mute">{String(index + 1).padStart(2, '0')}</span>
                          <span className="min-w-0 flex-1 truncate text-[16px] font-medium">{t('Line', 'البند')} {index + 1} · {item.description}</span>
                          <span className="font-mono text-[13px] tabular-nums text-ink-soft" dir="ltr">{item.line_total}</span>
                          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 self-center transition-transform duration-500 ease-paper group-open/line:rotate-45" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M8 2v12M2 8h12" strokeLinecap="round" /></svg>
                        </summary>
                        <div className="grid gap-x-8 pb-5 sm:grid-cols-2">
                          {lineFields.map(([key, label]) => renderField({ path: `line_items[${index}].${key}`, label, value: item[key] }))}
                        </div>
                      </details>
                    ))}
                  </div>
                </section>
              </Reveal>
            </>
          )}
        </div>
      </div>

      {/* ---------- floating decision dock ---------- */}
      <AnimatePresence>
        {canReview && (
          <motion.div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4" initial={{ y: 90, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 90, opacity: 0 }} transition={{ duration: 0.9, ease: EASE, delay: 0.5 }}>
            <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-inkbg p-2 ps-6 text-onink shadow-lift sm:gap-4">
              <button type="button" onClick={() => setShowKeys((v) => !v)} aria-label={t('Keyboard shortcuts', 'اختصارات لوحة المفاتيح')} className="hidden rounded border border-onink/30 px-1.5 py-0.5 font-mono text-[10px] text-onink/70 hover:text-onink md:block" dir="ltr">J K · E · N · A · R · ?</button>
              <p className="hidden font-mono text-[11px] caps tracking-label text-onink/70 sm:block">
                {findings.length === 0 ? t('Clean', 'سليمة') : `${findings.length} ${t('open', 'مفتوحة')}${hasBlockers ? ` · ${t('blocked', 'محجوبة')}` : ''}`}
              </p>
              <button type="button" onClick={() => startDecision('REJECT')} disabled={working || refreshRequired}
                className="rounded-full border border-onink/30 px-5 py-2.5 text-[13px] font-semibold transition hover:border-stamp hover:bg-stamp disabled:opacity-40">{t('Reject', 'رفض')}</button>
              <button type="button" onClick={() => startDecision('APPROVE')} disabled={working || refreshRequired || hasBlockers}
                className="rounded-full bg-onink px-6 py-2.5 text-[13px] font-semibold text-inkbg transition hover:bg-ledger hover:text-paper disabled:opacity-40 disabled:hover:bg-onink disabled:hover:text-inkbg">{t('Approve Invoice', 'اعتماد الفاتورة')}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showKeys && (
          <motion.div role="dialog" aria-label={t('Keyboard shortcuts', 'اختصارات لوحة المفاتيح')} initial={{ opacity: 0, y: 20, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={{ opacity: 0, y: 20 }} transition={{ duration: 0.5, ease: EASE }}
            className="edge-zig-bottom fixed bottom-24 start-5 z-40 w-[260px] bg-paper px-5 pb-8 pt-4 shadow-sheet">
            <p className="label">{t('Keyboard review', 'المراجعة بلوحة المفاتيح')}</p>
            <dl className="mt-3 space-y-1.5 text-[13px]">
              {([['J / K', t('Next / previous field', 'الحقل التالي / السابق')], ['E', t('Correct the field', 'تصحيح الحقل')], ['N', t('Margin note', 'ملاحظة هامشية')], ['A', t('Approve', 'اعتماد')], ['R', t('Reject', 'رفض')], ['?', t('This panel', 'هذه اللوحة')]] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3"><dt className="font-mono text-[12px] font-medium" dir="ltr">{k}</dt><dd className="text-ink-soft">{v}</dd></div>
              ))}
            </dl>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- correction slip ---------- */}
      <AnimatePresence>
        {editingField && (
          <motion.div data-lenis-prevent className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.form
              role="dialog" aria-modal="true" aria-labelledby="correction-title" onSubmit={saveCorrection}
              className="edge-zig-bottom w-full max-w-md bg-paper px-7 pb-12 pt-7 shadow-sheet"
              initial={{ y: 60, rotate: 2, opacity: 0 }} animate={{ y: 0, rotate: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.7, ease: EASE }}
            >
              <p className="label">{t('Correction slip', 'قسيمة تصحيح')}</p>
              <h3 id="correction-title" className="mt-1 font-display text-[32px] leading-none">{t('Correct Extracted Field', 'تصحيح القيمة المستخرجة')}</h3>
              <p className="mt-4 text-[14px] font-medium">{editingField.label}</p>
              <p className="mt-1 font-mono text-[12px] text-ink-mute" dir="ltr"><span className="line-through decoration-stamp decoration-2">{displayValue(editingField.value)}</span></p>
              {reviewError && <p role="alert" className="mt-3 text-[13px] text-stamp-deep">{reviewError}</p>}
              <label className="mt-6 block">
                <span className="label">{t('Corrected Value', 'القيمة المصححة')}</span>
                <input type="text" autoFocus required={!editingField.nullable} value={editValue} onChange={(event) => setEditValue(event.target.value)} className="field-input" />
              </label>
              <label className="mt-5 block">
                <span className="label">{t('Reason for Adjustment', 'سبب التعديل')}</span>
                <input type="text" required maxLength={256} value={editReason} onChange={(event) => setEditReason(event.target.value)} className="field-input" />
              </label>
              <div className="mt-8 flex justify-end gap-3">
                <button type="button" onClick={() => setEditingField(null)} disabled={working} className="btn-line">{t('Cancel', 'إلغاء')}</button>
                <button type="submit" disabled={working || !editReason.trim() || (!editingField.nullable && !editValue.trim())} className="btn-ink">
                  <span>{working ? t('Saving…', 'جارٍ الحفظ…') : t('Save & Re-validate', 'حفظ وإعادة التحقق')}</span>
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- decision slip ---------- */}
      <AnimatePresence>
        {pendingDecision && (
          <motion.div data-lenis-prevent className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.form
              role="dialog" aria-modal="true" aria-labelledby="decision-title"
              onSubmit={(event) => { event.preventDefault(); if (decisionReason.trim()) void decide(pendingDecision, decisionReason.trim()); }}
              className="edge-zig-bottom w-full max-w-md bg-paper px-7 pb-12 pt-7 shadow-sheet"
              initial={{ y: 60, rotate: -2, opacity: 0 }} animate={{ y: 0, rotate: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.7, ease: EASE }}
            >
              <p className="label">{t('Decision slip', 'قسيمة قرار')}</p>
              <h3 id="decision-title" className="mt-1 font-display text-[32px] leading-none">
                {pendingDecision === 'REJECT' ? t('Reject Invoice', 'رفض الفاتورة') : t('Approve with Review Findings', 'اعتماد مع وجود ملاحظات مراجعة')}
              </h3>
              {reviewError && <p role="alert" className="mt-3 text-[13px] text-stamp-deep">{reviewError}</p>}
              <label className="mt-6 block">
                <span className="label">{t('Decision Reason', 'سبب القرار')}</span>
                <textarea autoFocus required value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} rows={3} className="field-input resize-none" />
              </label>
              <div className="mt-8 flex justify-end gap-3">
                <button type="button" onClick={() => setPendingDecision(null)} disabled={working} className="btn-line">{t('Cancel', 'إلغاء')}</button>
                <button type="submit" disabled={working || !decisionReason.trim() || (pendingDecision === 'APPROVE' && hasBlockers)} className="btn-ink">
                  <span>{pendingDecision === 'REJECT' ? t('Confirm Rejection', 'تأكيد الرفض') : t('Confirm Approval', 'تأكيد الاعتماد')}</span>
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- audit tape ---------- */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showAuditDrawer && (
            <div data-lenis-prevent className="fixed inset-0 z-50 overflow-hidden">
              {/* Full-screen backdrop blur */}
              <motion.div
                className="fixed inset-0 bg-ink/40 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                onClick={() => setShowAuditDrawer(false)}
              />

              {/* Adaptive receipt tape hanging from top and sitting flush next to the end border */}
              <div className="fixed inset-x-0 top-0 flex justify-end pointer-events-none">
                <motion.aside
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="audit-title"
                  onClick={(e) => e.stopPropagation()}
                  className="edge-zig-bottom pointer-events-auto relative flex w-full max-w-[440px] max-h-[82vh] flex-col bg-paper p-6 pb-14 shadow-sheet"
                  style={{ filter: 'drop-shadow(0 24px 30px rgba(60,42,12,.3))' }}
                  initial={{ x: isRtl ? '-100%' : '100%', opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: isRtl ? '-100%' : '100%', opacity: 0 }}
                  transition={{ duration: 0.45, ease: EASE }}
                >
                  <div className="flex shrink-0 items-start justify-between gap-3 border-b border-ink/80 pb-3">
                    <div>
                      <p className="label">{t('Ledger tape', 'شريط الدفتر')}</p>
                      <h3 id="audit-title" className="mt-1 font-display text-[30px] leading-none">{t('Audit Event Timeline', 'سجل العمليات والتدقيق')}</h3>
                    </div>
                    <button type="button" onClick={() => setShowAuditDrawer(false)} aria-label={t('Close audit trail', 'إغلاق سجل التدقيق')} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-ink/25 transition hover:rotate-90 hover:bg-inkbg hover:text-onink">
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M3 3l10 10M13 3 3 13" strokeLinecap="round" /></svg>
                    </button>
                  </div>
                  {auditLoading && <p className="mt-4 text-sm text-ink-soft animate-blink">{t('Loading audit events…', 'جارٍ تحميل سجل التدقيق…')}</p>}
                  {auditError && <p role="alert" className="mt-4 text-sm text-stamp-deep">{t('Could not load audit events.', 'تعذر تحميل سجل التدقيق.')}</p>}
                  {!auditLoading && !auditError && auditEvents.length === 0 && (
                    <p className="mt-4 text-sm text-ink-soft">{t('No audit events recorded yet.', 'لا توجد عمليات مسجلة بعد.')}</p>
                  )}
                  <ol className="mt-4 flex-1 overflow-y-auto pe-1 [scrollbar-width:thin]">
                    {auditEvents.map((event, i) => (
                      <motion.li key={event.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.05, duration: 0.5, ease: EASE }}
                        className="space-y-2 border-b border-dashed border-ink/35 py-3.5 text-[13px] last:border-b-0">
                        <div className="flex flex-wrap items-baseline justify-between gap-1">
                          <span className="font-mono text-[12px] font-medium text-stamp">{event.action}</span>
                          <time dateTime={event.timestamp} className="font-mono text-[11px] text-ink-mute" dir="ltr">{new Date(event.timestamp).toLocaleString()}</time>
                        </div>
                        <p className="text-ink-soft">{t('Actor', 'المنفّذ')} · {event.actor_id}</p>
                        {event.action === 'FIELD_CORRECTION' ? (
                          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 break-all">
                            <dt className="label">{t('Field', 'الحقل')}</dt><dd className="font-mono text-[12px]">{displayValue(event.metadata.field)}</dd>
                            <dt className="label">{t('Original value', 'القيمة الأصلية')}</dt><dd className="font-mono text-[12px] line-through decoration-stamp">{displayValue(event.metadata.from)}</dd>
                            <dt className="label">{t('Corrected value', 'القيمة المصححة')}</dt><dd className="font-mono text-[12px] font-medium">{displayValue(event.metadata.to)}</dd>
                            <dt className="label">{t('Reason', 'السبب')}</dt><dd>{displayValue(event.metadata.reason)}</dd>
                          </dl>
                        ) : (
                          <pre className="overflow-x-auto bg-paper-warm p-2 font-mono text-[11px] text-ink-soft" dir="ltr">{JSON.stringify(event.metadata, null, 2)}</pre>
                        )}
                      </motion.li>
                    ))}
                  </ol>
                </motion.aside>
              </div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};
