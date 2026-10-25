import {
  describeRestore,
  formatSize,
  InvalidBackupError,
  isBackupDue,
  parseBackup,
} from './backup-logic';

describe('parseBackup', () => {
  const valid = JSON.stringify({
    format: 'didiflow-backup',
    version: 1,
    exported_at: '2026-10-25T12:00:00Z',
    tables: { tasks: [{}, {}], projects: [{}], tags: [], task_status_history: [{}] },
  });

  it('validates and previews a DidiFlow backup', () => {
    const { preview } = parseBackup(valid);
    expect(preview).toEqual({
      exportedAt: '2026-10-25T12:00:00Z',
      counts: [
        { label: 'Tarefas', count: 2 },
        { label: 'Projetos', count: 1 },
      ],
      total: 3,
    });
  });

  it.each([
    ['{not json', 'JSON válido'],
    ['{"format":"other"}', 'não é um backup'],
    ['{"format":"didiflow-backup","version":2,"tables":{}}', 'Versão'],
    ['{"format":"didiflow-backup","version":1}', 'não contém tabelas'],
  ])('rejects %s', (content, message) => {
    expect(() => parseBackup(content)).toThrow(InvalidBackupError);
    expect(() => parseBackup(content)).toThrow(new RegExp(message));
  });
});

describe('describeRestore', () => {
  it('summarizes inserted, updated and skipped rows', () => {
    expect(
      describeRestore({
        mode: 'merge',
        tables: {
          tasks: { inserted: 3, updated: 1, skipped: 2 },
          task_tags: { inserted: 4 },
        },
      }),
    ).toBe('Backup restaurado: 7 adicionado(s), 1 atualizado(s), 2 mantido(s) sem alteração.');
  });
});

describe('isBackupDue', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');

  it('is due without previous backups or after the interval', () => {
    expect(isBackupDue(null, 24, now)).toBe(true);
    expect(isBackupDue('2026-10-25T11:00:00Z', 24, now)).toBe(true);
  });

  it('is not due within the interval', () => {
    expect(isBackupDue('2026-10-26T01:00:00Z', 24, now)).toBe(false);
  });
});

describe('formatSize', () => {
  it('formats kilobytes and megabytes', () => {
    expect(formatSize(340 * 1024)).toBe('340 KB');
    expect(formatSize(1.25 * 1024 * 1024)).toBe('1,3 MB');
    expect(formatSize(10)).toBe('1 KB');
  });
});
