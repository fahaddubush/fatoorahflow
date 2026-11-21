import {
  AnalyticsSummary,
  AuditEvent,
  DocumentDetail,
  DocumentListItem,
  DocumentUpload,
  ValidationFinding,
  WorkflowJob,
} from '../types';

const API_BASE = '/api/v1';

export class ReviewApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly findings?: ValidationFinding[],
  ) {
    super(message);
    this.name = 'ReviewApiError';
  }
}

async function reviewError(res: Response, fallback: string): Promise<ReviewApiError> {
  const body = await res.json().catch(() => ({}));
  const detail = body?.detail;
  const message =
    typeof detail === 'string'
      ? detail
      : typeof detail?.message === 'string'
      ? detail.message
      : typeof detail?.[0]?.msg === 'string'
      ? detail[0].msg
      : fallback;
  const findings = Array.isArray(detail?.findings) ? detail.findings : undefined;
  return new ReviewApiError(res.status, message, findings);
}

export async function fetchHealth(): Promise<{ status: string; app: string }> {
  const res = await fetch('/healthz');
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}

export async function fetchAnalytics(tenantId = 'tenant-demo-01'): Promise<AnalyticsSummary> {
  const res = await fetch(`${API_BASE}/analytics`, {
    headers: { 'X-Tenant-ID': tenantId },
  });
  if (!res.ok) throw new Error('Failed to fetch analytics');
  return res.json();
}

export async function fetchDocuments(
  statusFilter?: string,
  tenantId = 'tenant-demo-01',
): Promise<{ items: DocumentListItem[]; total: number }> {
  const url = new URL(`${window.location.origin}${API_BASE}/documents`);
  if (statusFilter && statusFilter !== 'ALL') {
    url.searchParams.set('status', statusFilter);
  }
  const res = await fetch(url.toString(), {
    headers: { 'X-Tenant-ID': tenantId },
  });
  if (!res.ok) throw new Error('Failed to fetch documents');
  return res.json();
}

export async function fetchDocumentDetail(
  id: string,
  tenantId = 'tenant-demo-01',
): Promise<DocumentDetail> {
  const res = await fetch(`${API_BASE}/documents/${id}`, {
    headers: { 'X-Tenant-ID': tenantId },
  });
  if (!res.ok) throw new Error('Failed to fetch document detail');
  return res.json();
}

export function getPageImageUrl(docId: string, pageNo = 1, tenantId = 'tenant-demo-01'): string {
  return `${API_BASE}/documents/${docId}/pages/${pageNo}?tenant_id=${encodeURIComponent(tenantId)}`;
}

export async function uploadDocument(
  file: File,
  idempotencyKey: string,
  tenantId = 'tenant-demo-01',
): Promise<DocumentUpload> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/documents`, {
    method: 'POST',
    headers: {
      'X-Tenant-ID': tenantId,
      'Idempotency-Key': idempotencyKey,
    },
    body: formData,
  });

  if (!res.ok) throw await reviewError(res, 'Failed to upload document');

  return res.json();
}

export async function fetchJob(
  id: string,
  signal?: AbortSignal,
  tenantId = 'tenant-demo-01',
): Promise<WorkflowJob> {
  const res = await fetch(`${API_BASE}/jobs/${id}`, {
    headers: { 'X-Tenant-ID': tenantId },
    signal,
    cache: 'no-store',
  });
  if (!res.ok) throw await reviewError(res, 'Failed to load processing status');
  return res.json();
}

export async function updateJob(
  id: string,
  action: 'cancel' | 'retry',
  tenantId = 'tenant-demo-01',
): Promise<WorkflowJob> {
  const res = await fetch(`${API_BASE}/jobs/${id}/${action}`, {
    method: 'POST',
    headers: { 'X-Tenant-ID': tenantId },
  });
  if (!res.ok) throw await reviewError(res, 'Failed to update processing status');
  return res.json();
}

export async function correctField(
  docId: string,
  fieldPath: string,
  correctedValue: unknown,
  expectedRevision: number,
  reason: string,
  tenantId = 'tenant-demo-01',
): Promise<{ status: string; new_revision: number; findings: ValidationFinding[] }> {
  const res = await fetch(`${API_BASE}/reviews/${docId}/fields`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': tenantId,
    },
    body: JSON.stringify({
      field_path: fieldPath,
      corrected_value: correctedValue,
      reason,
      expected_revision: expectedRevision,
      actor_id: 'operator-reviewer',
    }),
  });

  if (!res.ok) {
    throw await reviewError(res, 'Correction rejected by server');
  }

  return res.json();
}

export async function submitDecision(
  docId: string,
  action: 'APPROVE' | 'REJECT',
  reason: string,
  expectedRevision: number,
  tenantId = 'tenant-demo-01',
): Promise<{ status: string; doc_status: string }> {
  const res = await fetch(`${API_BASE}/reviews/${docId}/decision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': tenantId,
    },
    body: JSON.stringify({
      action,
      reason,
      expected_revision: expectedRevision,
      actor_id: 'operator-reviewer',
    }),
  });

  if (!res.ok) {
    throw await reviewError(res, 'Decision submission failed');
  }

  return res.json();
}

export async function fetchAuditTrail(
  docId: string,
  tenantId = 'tenant-demo-01',
): Promise<AuditEvent[]> {
  const res = await fetch(`${API_BASE}/documents/${docId}/audit`, {
    headers: { 'X-Tenant-ID': tenantId },
  });
  if (!res.ok) throw new Error('Failed to fetch audit events');
  return res.json();
}
