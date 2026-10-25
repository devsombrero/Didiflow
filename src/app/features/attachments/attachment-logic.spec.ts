import {
  addFailureMessage,
  fileIcon,
  formatBytes,
  MAX_TASK_ATTACHMENT_BYTES,
  remainingBytes,
  usedBytes,
} from './attachment-logic';

describe('attachment logic', () => {
  it('sums usage and the remaining quota', () => {
    const rows = [{ size_bytes: 10 * 1024 * 1024 }, { size_bytes: 5 * 1024 * 1024 }];
    expect(usedBytes(rows)).toBe(15 * 1024 * 1024);
    expect(remainingBytes(rows)).toBe(35 * 1024 * 1024);
    expect(remainingBytes([{ size_bytes: MAX_TASK_ATTACHMENT_BYTES + 1 }])).toBe(0);
  });

  it('formats sizes in pt-BR', () => {
    expect(formatBytes(100)).toBe('1 KB');
    expect(formatBytes(850 * 1024)).toBe('850 KB');
    expect(formatBytes(12.4 * 1024 * 1024)).toBe('12,4 MB');
    expect(formatBytes(1.25 * 1024 ** 3)).toBe('1,3 GB');
  });

  it('explains why files were not added', () => {
    expect(
      addFailureMessage({
        status: 'quota',
        requestedBytes: 2 * 1024 ** 2,
        remainingBytes: 1024 ** 2,
      }),
    ).toBe('Os arquivos somam 2 MB, mas restam 1 MB dos 50 MB desta tarefa.');
    expect(addFailureMessage({ status: 'quota', requestedBytes: 10, remainingBytes: 0 })).toContain(
      'já usa os 50 MB',
    );
    expect(
      addFailureMessage({ status: 'disk-full', requestedBytes: 10, freeBytes: 100 * 1024 ** 2 }),
    ).toContain('100 MB livres');
    expect(addFailureMessage({ status: 'empty-file', name: 'a.txt' })).toBe(
      'O arquivo "a.txt" está vazio.',
    );
    expect(addFailureMessage({ status: 'canceled' })).toBeNull();
  });

  it('picks an icon by MIME type', () => {
    expect(fileIcon('image/png')).toBe('image');
    expect(fileIcon('application/pdf')).toBe('picture_as_pdf');
    expect(fileIcon('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(
      'table_chart',
    );
    expect(fileIcon(null)).toBe('draft');
  });
});
