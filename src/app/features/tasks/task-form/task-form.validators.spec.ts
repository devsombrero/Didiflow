import { FormControl, FormGroup } from '@angular/forms';
import { dueAfterStart, isHttpsUrl, linkRequiredWhen } from './task-form.validators';

describe('task form validators', () => {
  it('accepts only https URLs', () => {
    expect(isHttpsUrl('https://empresa.atlassian.net/browse/DF-1')).toBe(true);
    expect(isHttpsUrl('http://empresa.atlassian.net')).toBe(false);
    expect(isHttpsUrl('https://com espaço')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpsUrl(`https://x.dev/${'a'.repeat(2048)}`)).toBe(false);
  });

  describe('linkRequiredWhen', () => {
    const group = (flag: boolean, url: string) =>
      new FormGroup(
        { has: new FormControl(flag), url: new FormControl(url) },
        { validators: linkRequiredWhen('has', 'url', 'jiraUrl') },
      );

    it('ignores the URL when the flag is off', () => {
      expect(group(false, 'not a url').errors).toBeNull();
    });

    it('requires a valid https URL when the flag is on', () => {
      expect(group(true, '  ').errors).toEqual({ jiraUrl: 'required' });
      expect(group(true, 'http://jira').errors).toEqual({ jiraUrl: 'invalid' });
      expect(group(true, 'https://jira.example/DF-1').errors).toBeNull();
    });
  });

  describe('dueAfterStart', () => {
    const group = (start: string, due: string) =>
      new FormGroup(
        { start_date: new FormControl(start), due_date: new FormControl(due) },
        { validators: dueAfterStart },
      );

    it('rejects a due date before the start date', () => {
      expect(group('2026-10-10', '2026-10-09').errors).toEqual({ dueBeforeStart: true });
    });

    it('accepts equal dates and missing values', () => {
      expect(group('2026-10-10', '2026-10-10').errors).toBeNull();
      expect(group('', '2026-10-01').errors).toBeNull();
      expect(group('2026-10-10', '').errors).toBeNull();
    });
  });
});
