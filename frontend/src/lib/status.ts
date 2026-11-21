import { DocumentStatus } from '../types';

export type Tone = 'ink' | 'amber' | 'green' | 'red' | 'blue' | 'mute';

export const statusTone: Record<DocumentStatus, Tone> = {
  UPLOADED: 'mute', QUEUED: 'mute', PROCESSING: 'blue', NEEDS_REVIEW: 'amber', READY_FOR_REVIEW: 'blue',
  APPROVED: 'green', REJECTED: 'red', FAILED: 'red', CANCELLED: 'mute',
};

export const toneClass: Record<Tone, string> = {
  ink: 'border-ink text-ink',
  amber: 'border-manila-shade text-manila-shade',
  green: 'border-ledger text-ledger',
  red: 'border-stamp text-stamp',
  blue: 'border-carbon text-carbon',
  mute: 'border-ink-mute text-ink-mute',
};

export function statusLabel(status: DocumentStatus, isRtl: boolean): string {
  const l: Record<DocumentStatus, [string, string]> = {
    UPLOADED: ['Queued', 'في الانتظار'],
    QUEUED: ['Queued', 'في الانتظار'],
    PROCESSING: ['Processing', 'قيد المعالجة'],
    NEEDS_REVIEW: ['Needs review', 'تتطلب تدقيقاً'],
    READY_FOR_REVIEW: ['Ready', 'جاهزة'],
    APPROVED: ['Approved', 'معتمدة'],
    REJECTED: ['Rejected', 'مرفوضة'],
    FAILED: ['Failed', 'فشلت'],
    CANCELLED: ['Cancelled', 'أُلغيت'],
  };
  return l[status][isRtl ? 1 : 0];
}
