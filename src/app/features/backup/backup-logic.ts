/** Tables shown in the restore preview, in a friendly order. */
const TABLE_LABELS: [string, string][] = [
  ['tasks', 'Tarefas'],
  ['projects', 'Projetos'],
  ['categories', 'Categorias'],
  ['tags', 'Tags'],
  ['work_contexts', 'Contextos'],
  ['time_entries', 'Registros de tempo'],
  ['personal_goals', 'Metas'],
  ['skill_achievements', 'Desenvolvimento'],
  ['task_reminders', 'Lembretes'],
  ['daily_priorities', 'Prioridades do dia'],
  ['focus_sessions', 'Sessões de foco'],
];

export interface BackupPreview {
  exportedAt: string | null;
  counts: { label: string; count: number }[];
  total: number;
}

export class InvalidBackupError extends Error {
  override readonly name = 'InvalidBackupError';
}

/** Parses and validates a DidiFlow backup file, returning it with a preview. */
export function parseBackup(content: string): {
  data: Record<string, unknown>;
  preview: BackupPreview;
} {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    throw new InvalidBackupError('O arquivo não é um JSON válido.');
  }
  const record = data as {
    format?: unknown;
    version?: unknown;
    exported_at?: unknown;
    tables?: unknown;
  };
  if (record?.format !== 'didiflow-backup') {
    throw new InvalidBackupError('O arquivo não é um backup do DidiFlow.');
  }
  if (record.version !== 1) {
    throw new InvalidBackupError('Versão de backup não suportada.');
  }
  if (typeof record.tables !== 'object' || record.tables === null) {
    throw new InvalidBackupError('O backup não contém tabelas.');
  }

  const tables = record.tables as Record<string, unknown>;
  const counts = TABLE_LABELS.map(([key, label]) => ({
    label,
    count: Array.isArray(tables[key]) ? (tables[key] as unknown[]).length : 0,
  })).filter((row) => row.count > 0);

  return {
    data: data as Record<string, unknown>,
    preview: {
      exportedAt: typeof record.exported_at === 'string' ? record.exported_at : null,
      counts,
      total: counts.reduce((sum, row) => sum + row.count, 0),
    },
  };
}

export interface RestoreResult {
  mode: 'merge' | 'replace';
  tables: Record<string, { inserted?: number; updated?: number; skipped?: number }>;
}

/** One-line pt-BR summary of a restore result. */
export function describeRestore(result: RestoreResult): string {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  for (const counts of Object.values(result.tables)) {
    inserted += counts.inserted ?? 0;
    updated += counts.updated ?? 0;
    skipped += counts.skipped ?? 0;
  }
  const parts = [`${inserted} adicionado(s)`];
  if (updated) parts.push(`${updated} atualizado(s)`);
  if (skipped) parts.push(`${skipped} mantido(s) sem alteração`);
  return `Backup restaurado: ${parts.join(', ')}.`;
}

/** True when no automatic backup exists yet or the newest is older than the interval. */
export function isBackupDue(
  lastAutoAt: string | null,
  intervalHours: number,
  now = Date.now(),
): boolean {
  if (!lastAutoAt) return true;
  return now - Date.parse(lastAutoAt) >= intervalHours * 3_600_000;
}

/** "1,2 MB", "340 KB". */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
