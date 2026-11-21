/**
 * Dev-only mock of the FatoorahFlow API so the UI can be exercised without the
 * backend. Enabled with `npm run dev:mock` (VITE_MOCK=1). Never part of a build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const evidence = JSON.parse(fs.readFileSync(path.join(here, 'evidence.json'), 'utf8'));
const pageImage = fs.readFileSync(path.join(here, 'sample-invoice.png'));

type J = Record<string, any>;
const now = () => new Date().toISOString();
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function baseExtraction(id: string): J {
  const li = (d: string, q: string, u: string, sub: string, tax: string, tot: string) => ({
    description: d, quantity: q, unit_price: u, discount_amount: '0.00', tax_rate: '0.15',
    line_subtotal: sub, line_tax: tax, line_total: tot,
  });
  return {
    schema_version: '1.2', document_id: id, tenant_id: 'tenant-demo-01', source_sha256: 'f3a9' + id,
    document_type: 'tax_invoice', language_detected: ['en', 'ar'],
    seller: { legal_name: 'Al Noor Trading Co.', vat_registration_number: '300112233400003' },
    buyer: { legal_name: 'Red Sea Logistics LLC', vat_registration_number: '310998877600003' },
    invoice_number: 'INV-2026-00417', issue_date: '2026-10-28', issue_time: '14:32:08', currency: 'SAR',
    line_items: [
      li('Industrial label printer', '2', '850.00', '1700.00', '255.00', '1955.00'),
      li('Thermal paper rolls (carton)', '10', '42.00', '420.00', '63.00', '483.00'),
      li('On-site installation', '1', '300.00', '300.00', '45.00', '345.00'),
    ],
    subtotal: '2420.00', discount_total: '0.00', vat_total: '363.00', grand_total: '2873.00',
    qr: { present: true, decode_status: 'decoded_tlv', decoded_tags: {} },
    evidence, confidence: {}, warnings: [], model_info: {},
  };
}

function findingsFor(ex: J): J[] {
  const out: J[] = [];
  const sub = Number(ex.subtotal), vat = Number(ex.vat_total), grand = Number(ex.grand_total);
  if (Math.abs(sub + vat - grand) > 0.005) {
    out.push({
      rule_id: 'ZATCA-ARITH-GRAND-TOTAL', rule_version: '2026.3', severity: 'review_required', status: 'open',
      field_paths: ['grand_total', 'subtotal', 'vat_total'], observed: ex.grand_total, expected: (sub + vat).toFixed(2),
      explanation: `Grand total ${ex.grand_total} does not equal subtotal plus VAT (${(sub + vat).toFixed(2)}).`,
    });
  }
  if (!ex.buyer?.legal_name) {
    out.push({
      rule_id: 'ZATCA-PARTY-BUYER-NAME', rule_version: '2026.3', severity: 'blocking', status: 'open',
      field_paths: ['buyer.legal_name'], observed: null, expected: 'non-empty',
      explanation: 'A tax invoice must name the buyer.',
    });
  }
  out.push({
    rule_id: 'ZATCA-QR-BASE-TAGS', rule_version: '2026.3', severity: 'info', status: 'pass',
    field_paths: ['qr'], observed: 'decoded', expected: 'decoded', explanation: 'QR payload decoded; base tags match.',
  });
  return out.filter((f) => f.rule_id !== 'ZATCA-QR-BASE-TAGS');
}

interface Doc { id: string; filename: string; status: string; kind: string; pages: number; created_at: string;
  job_id: string | null; extraction: J | null; revision: number; audit: J[]; policy: string; }
interface Job { id: string; document_id: string; started: number; fail: boolean; cancelled: boolean; }

const docs = new Map<string, Doc>();
const jobs = new Map<string, Job>();

function seed(id: string, filename: string, status: string, minutes: number, tweak?: (e: J) => void) {
  const ex = baseExtraction(id); tweak?.(ex);
  docs.set(id, { id, filename, status, kind: status === 'FAILED' ? 'unknown' : 'tax_invoice', pages: 1, created_at: ago(minutes),
    job_id: status === 'FAILED' ? 'job-' + id : null, extraction: status === 'FAILED' ? null : ex, revision: 1, policy: 'ksa-2026.3',
    audit: [{ id: 'a1-' + id, action: 'DOCUMENT_UPLOADED', actor_id: 'operator-reviewer', timestamp: ago(minutes), metadata: { filename } }] });
  if (status === 'FAILED') jobs.set('job-' + id, { id: 'job-' + id, document_id: id, started: 0, fail: true, cancelled: false });
}
seed('doc-sample-0417', 'sample-invoice.pdf', 'NEEDS_REVIEW', 6);
seed('doc-0416', 'Al-Rajhi-Supplies-0416.pdf', 'READY_FOR_REVIEW', 55, (e) => { e.grand_total = '2783.00'; });
seed('doc-0415', 'سند-فاتورة-الأفق.pdf', 'APPROVED', 180, (e) => { e.grand_total = '2783.00'; });
seed('doc-0414', 'Najd-Packaging-Oct.pdf', 'APPROVED', 400, (e) => { e.grand_total = '2783.00'; });
seed('doc-0413', 'scan-0413-handwritten.pdf', 'FAILED', 720);
seed('doc-0412', 'Gulf-Freight-INV-0412.pdf', 'REJECTED', 1500, (e) => { e.grand_total = '2783.00'; });

function stageFor(job: Job): { status: string; stage: string | null } {
  if (job.fail) return { status: 'FAILED', stage: 'EXTRACT' };
  if (job.cancelled) return { status: 'CANCELLED', stage: null };
  const t = (Date.now() - job.started) / 1000;
  if (t < 1.2) return { status: 'QUEUED', stage: null };
  if (t < 3.6) return { status: 'PROCESSING', stage: 'RENDER' };
  if (t < 6) return { status: 'PROCESSING', stage: 'EXTRACT' };
  if (t < 8.4) return { status: 'PROCESSING', stage: 'VALIDATE' };
  return { status: 'SUCCEEDED', stage: 'VALIDATE' };
}
function syncDoc(job: Job) {
  const d = docs.get(job.document_id)!; const s = stageFor(job);
  if (s.status === 'SUCCEEDED' && !d.extraction) {
    d.extraction = baseExtraction(d.id); d.kind = 'tax_invoice'; d.status = 'NEEDS_REVIEW';
  } else if (s.status === 'PROCESSING' || s.status === 'QUEUED') d.status = s.status;
  else if (s.status === 'CANCELLED') d.status = 'CANCELLED';
}
const jobBody = (job: Job): J => {
  syncDoc(job); const s = stageFor(job);
  return { id: job.id, document_id: job.document_id, status: s.status, stage: s.stage, cancellation_requested: false,
    can_retry: s.status === 'FAILED' || s.status === 'CANCELLED', error_code: job.fail ? 'OCR_REQUIRED' : null, worker: true, attempt: 1 };
};
function detail(d: Doc): J {
  const ex = d.extraction;
  const findings = ex ? findingsFor(ex) : [];
  const reviewable = d.status === 'NEEDS_REVIEW' || d.status === 'READY_FOR_REVIEW';
  return { id: d.id, job_id: d.job_id, filename: d.filename, status: d.status, kind: d.kind, page_count: 1, source_hash: 'f3a9' + d.id,
    created_at: d.created_at, pages: ex ? [{ page_no: 1, width: 794, height: 1123, text_quality: 0.98 }] : [],
    extraction: ex, evidence: ex ? evidence : {}, findings, policy_version: d.policy,
    review_task: ex ? { id: 'rt-' + d.id, status: reviewable ? 'PENDING' : 'DONE', priority: 'normal', revision_no: d.revision } : null };
}
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function mockApi(): Plugin {
  return {
    name: 'fatoorahflow-mock-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://x');
        if (!url.pathname.startsWith('/api/v1') && url.pathname !== '/healthz') return next();
        const send = (code: number, body: unknown, type = 'application/json') => {
          res.statusCode = code; res.setHeader('Content-Type', type);
          res.end(Buffer.isBuffer(body) ? body : JSON.stringify(body));
        };
        const readBody = () => new Promise<Buffer>((ok) => { const c: Buffer[] = []; req.on('data', (b) => c.push(b)); req.on('end', () => ok(Buffer.concat(c))); });
        const p = url.pathname.replace('/api/v1', '');
        let m: RegExpMatchArray | null;
        try {
          if (url.pathname === '/healthz') return send(200, { status: 'ok', app: 'fatoorahflow-mock' });
          if (p === '/analytics') {
            const counts: J = {}; docs.forEach((d) => { counts[d.status] = (counts[d.status] ?? 0) + 1; });
            return send(200, { total_documents: docs.size, counts_by_status: counts, throughput_docs_per_minute: 4.2, measured_avg_latency_ms: 8420, cost_usd_actual: 0.31 });
          }
          if (p === '/documents' && req.method === 'GET') {
            jobs.forEach(syncDoc);
            const f = url.searchParams.get('status');
            const items = [...docs.values()].filter((d) => !f || d.status === f).sort((a, b) => b.created_at.localeCompare(a.created_at))
              .map((d) => ({ id: d.id, filename: d.filename, status: d.status, kind: d.kind, pages: d.pages, created_at: d.created_at }));
            return send(200, { items, total: items.length });
          }
          if (p === '/documents' && req.method === 'POST') {
            const raw = (await readBody()).toString('latin1');
            const name = /filename="([^"]+)"/.exec(raw)?.[1] ?? 'upload.pdf';
            await delay(1600);
            const id = 'doc-' + Math.random().toString(36).slice(2, 8); const jid = 'job-' + id;
            docs.set(id, { id, filename: name, status: 'QUEUED', kind: 'unknown', pages: 1, created_at: now(), job_id: jid, extraction: null, revision: 1, policy: 'ksa-2026.3',
              audit: [{ id: 'a-' + id, action: 'DOCUMENT_UPLOADED', actor_id: 'operator-reviewer', timestamp: now(), metadata: { filename: name } }] });
            jobs.set(jid, { id: jid, document_id: id, started: Date.now(), fail: false, cancelled: false });
            return send(201, { id, document_id: id, job_id: jid, status: 'QUEUED', filename: name });
          }
          if ((m = p.match(/^\/documents\/([^/]+)\/pages\/(\d+)$/))) return send(200, pageImage, 'image/png');
          if ((m = p.match(/^\/documents\/([^/]+)\/audit$/))) return send(200, docs.get(m[1])?.audit ?? []);
          if ((m = p.match(/^\/documents\/([^/]+)$/))) {
            const d = docs.get(m[1]); if (!d) return send(404, { detail: 'Not found' });
            const j = d.job_id ? jobs.get(d.job_id) : undefined; if (j) syncDoc(j);
            return send(200, detail(d));
          }
          if ((m = p.match(/^\/jobs\/([^/]+)(?:\/(cancel|retry))?$/))) {
            const j = jobs.get(m[1]); if (!j) return send(404, { detail: 'Not found' });
            if (m[2] === 'cancel') j.cancelled = true;
            if (m[2] === 'retry') { j.fail = false; j.cancelled = false; j.started = Date.now(); }
            return send(200, jobBody(j));
          }
          if ((m = p.match(/^\/reviews\/([^/]+)\/fields$/)) && req.method === 'PATCH') {
            const d = docs.get(m[1])!; const b = JSON.parse((await readBody()).toString());
            if (b.expected_revision !== d.revision) return send(409, { detail: 'revision conflict' });
            const keys = b.field_path.replace(/\[(\d+)\]/g, '.$1').split('.'); let o: J = d.extraction!;
            const from = keys.reduce((acc: any, k: string) => acc?.[k], o);
            keys.slice(0, -1).forEach((k: string) => { o = o[k]; }); o[keys[keys.length - 1]] = b.corrected_value;
            d.revision += 1;
            d.audit.push({ id: 'a' + d.revision, action: 'FIELD_CORRECTION', actor_id: b.actor_id, timestamp: now(), metadata: { field: b.field_path, from, to: b.corrected_value, reason: b.reason } });
            await delay(500);
            return send(200, { status: 'ok', new_revision: d.revision, findings: findingsFor(d.extraction!) });
          }
          if ((m = p.match(/^\/reviews\/([^/]+)\/decision$/)) && req.method === 'POST') {
            const d = docs.get(m[1])!; const b = JSON.parse((await readBody()).toString());
            if (b.expected_revision !== d.revision) return send(409, { detail: 'revision conflict' });
            d.status = b.action === 'APPROVE' ? 'APPROVED' : 'REJECTED'; d.revision += 1;
            d.audit.push({ id: 'ad' + d.revision, action: b.action === 'APPROVE' ? 'INVOICE_APPROVED' : 'INVOICE_REJECTED', actor_id: b.actor_id, timestamp: now(), metadata: { reason: b.reason } });
            await delay(500);
            return send(200, { status: 'ok', doc_status: d.status });
          }
          return send(404, { detail: 'Unknown mock route ' + p });
        } catch (e) { return send(500, { detail: String(e) }); }
      });
    },
  };
}
