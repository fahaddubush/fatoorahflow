export type DocumentStatus =
  | 'UPLOADED'
  | 'QUEUED'
  | 'PROCESSING'
  | 'NEEDS_REVIEW'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'FAILED'
  | 'CANCELLED';

export type FindingSeverity = 'info' | 'warning' | 'review_required' | 'blocking';

export type JobStatus = 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export type JobStage = 'RENDER' | 'EXTRACT' | 'VALIDATE';

export interface WorkflowJob {
  id: string;
  document_id: string;
  status: JobStatus;
  stage: JobStage | null;
  cancellation_requested: boolean;
  can_retry: boolean;
  error_code: string | null;
  worker: boolean;
  attempt: number;
}

export interface DocumentUpload {
  id: string;
  document_id: string;
  job_id: string | null;
  status: DocumentStatus;
  filename: string;
}

export function isActiveProcessing(status: DocumentStatus | JobStatus): boolean {
  return status === 'UPLOADED' || status === 'QUEUED' || status === 'PROCESSING';
}

export interface EvidenceBBox {
  page: number;
  bbox: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0.0 to 1.0
  raw_text: string;
  engine: string;
  confidence: number;
}

export interface LineItem {
  description: string;
  quantity: string;
  unit_price: string;
  discount_amount: string;
  tax_rate: string;
  line_subtotal: string;
  line_tax: string;
  line_total: string;
}

export interface Party {
  legal_name: string | null;
  vat_registration_number: string | null;
  address?: string | null;
}

export interface QRData {
  present: boolean;
  decode_status: string;
  decoded_tags: Record<string, string>;
  raw_payload?: string | null;
}

export interface InvoiceExtraction {
  schema_version: string;
  document_id: string;
  tenant_id: string;
  source_sha256: string;
  document_type: string;
  language_detected: string[];
  seller: Party;
  buyer?: Party | null;
  invoice_number: string | null;
  issue_date: string | null;
  issue_time: string | null;
  currency: string;
  line_items: LineItem[];
  subtotal: string | null;
  discount_total: string;
  vat_total: string | null;
  grand_total: string | null;
  qr: QRData;
  evidence: Record<string, EvidenceBBox[]>;
  confidence: Record<string, number>;
  warnings: string[];
  model_info: Record<string, unknown>;
}

export interface ValidationFinding {
  rule_id: string;
  rule_version: string;
  severity: FindingSeverity;
  status: string;
  field_paths: string[];
  observed: unknown;
  expected: unknown;
  explanation: string;
  citation_url?: string | null;
}

export interface DocumentPage {
  page_no: number;
  width: number;
  height: number;
  text_quality: number;
}

export interface DocumentListItem {
  id: string;
  filename: string;
  status: DocumentStatus;
  kind: string;
  pages: number;
  created_at: string;
}

export interface DocumentDetail {
  id: string;
  job_id: string | null;
  filename: string;
  status: DocumentStatus;
  kind: string;
  page_count: number;
  source_hash: string;
  created_at: string;
  pages: DocumentPage[];
  extraction: InvoiceExtraction | null;
  evidence: Record<string, EvidenceBBox[]>;
  findings: ValidationFinding[];
  policy_version?: string | null;
  review_task: {
    id: string;
    status: string;
    priority: string;
    revision_no: number;
  } | null;
}

export interface AuditEvent {
  id: string;
  action: string;
  actor_id: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface AnalyticsSummary {
  total_documents: number;
  counts_by_status: Partial<Record<DocumentStatus, number>>;
  throughput_docs_per_minute: number;
  measured_avg_latency_ms: number | null;
  cost_usd_actual: number;
}
