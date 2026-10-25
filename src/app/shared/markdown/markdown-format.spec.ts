import { applyMarkdown, markdownToPlainText } from './markdown-format';

describe('applyMarkdown', () => {
  it('wraps the selection for inline actions', () => {
    const result = applyMarkdown({ value: 'um texto', selectionStart: 3, selectionEnd: 8 }, 'bold');
    expect(result).toEqual({ value: 'um **texto**', selectionStart: 5, selectionEnd: 10 });
  });

  it('inserts a selected placeholder when nothing is selected', () => {
    const result = applyMarkdown({ value: '', selectionStart: 0, selectionEnd: 0 }, 'italic');
    expect(result.value).toBe('_texto em itálico_');
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe('texto em itálico');
  });

  it('prefixes every selected line for block actions', () => {
    const value = 'intro\nprimeiro\nsegundo';
    const result = applyMarkdown({ value, selectionStart: 8, selectionEnd: 20 }, 'checklist');
    expect(result.value).toBe('intro\n- [ ] primeiro\n- [ ] segundo');
  });

  it('numbers lines in order', () => {
    const result = applyMarkdown({ value: 'a\nb', selectionStart: 0, selectionEnd: 3 }, 'numbers');
    expect(result.value).toBe('1. a\n2. b');
  });

  it('selects the URL after inserting a link', () => {
    const result = applyMarkdown({ value: 'ver docs', selectionStart: 4, selectionEnd: 8 }, 'link');
    expect(result.value).toBe('ver [docs](https://)');
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe('https://');
  });
});

describe('markdownToPlainText', () => {
  it('drops Markdown syntax and keeps the words', () => {
    const markdown = [
      '## Objetivo',
      'Revisar o **contrato** e o _anexo_ em [docs](https://x.y).',
      '- [ ] ligar para o cliente',
      '1. enviar `proposta`',
      '> citação',
    ].join('\n');
    expect(markdownToPlainText(markdown)).toBe(
      'Objetivo Revisar o contrato e o anexo em docs. ligar para o cliente enviar proposta citação',
    );
  });

  it('keeps snake_case words intact', () => {
    expect(markdownToPlainText('campo due_date')).toBe('campo due_date');
  });
});
