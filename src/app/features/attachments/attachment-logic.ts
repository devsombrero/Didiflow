import type { AttachmentAddResult } from '../../../../electron/ipc/contract';

/** Total attachment size per task (also enforced by the database and the main process). */
export const MAX_TASK_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export function usedBytes(rows: readonly { size_bytes: number }[]): number {
  return rows.reduce((sum, row) => sum + row.size_bytes, 0);
}

export function remainingBytes(rows: readonly { size_bytes: number }[]): number {
  return Math.max(0, MAX_TASK_ATTACHMENT_BYTES - usedBytes(rows));
}

/** "850 KB", "12,4 MB", "1,2 GB". */
export function formatBytes(bytes: number): string {
  const options = { maximumFractionDigits: 1 };
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toLocaleString('pt-BR', options)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toLocaleString('pt-BR', options)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** User message for a pick that did not add files; null when nothing to say. */
export function addFailureMessage(result: AttachmentAddResult): string | null {
  switch (result.status) {
    case 'quota':
      return result.remainingBytes === 0
        ? 'Esta tarefa já usa os 50 MB de anexos. Remova algum arquivo para anexar outro.'
        : `Os arquivos somam ${formatBytes(result.requestedBytes)}, mas restam ${formatBytes(result.remainingBytes)} dos 50 MB desta tarefa.`;
    case 'disk-full':
      return `Espaço livre insuficiente no disco (${formatBytes(result.freeBytes)} livres). Libere espaço e tente de novo.`;
    case 'empty-file':
      return `O arquivo "${result.name}" está vazio.`;
    default:
      return null;
  }
}

const ICONS: [RegExp, string][] = [
  [/^image\//, 'image'],
  [/^video\//, 'movie'],
  [/^audio\//, 'audio_file'],
  [/pdf$/, 'picture_as_pdf'],
  [/(zip|compressed)/, 'folder_zip'],
  [/(sheet|excel|csv)/, 'table_chart'],
  [/(presentation|powerpoint)/, 'slideshow'],
  [/(word|text|markdown|json)/, 'description'],
];

export function fileIcon(mimeType: string | null): string {
  if (!mimeType) return 'draft';
  return ICONS.find(([pattern]) => pattern.test(mimeType))?.[1] ?? 'draft';
}
