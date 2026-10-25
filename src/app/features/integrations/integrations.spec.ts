import { INTEGRATIONS, parseJiraLink, parseSlackLink } from './integrations';

describe('integration registry', () => {
  it('only exposes manual links in version 1', () => {
    expect(INTEGRATIONS.filter((i) => i.status === 'manual-links').map((i) => i.id)).toEqual([
      'jira',
      'slack',
    ]);
    expect(INTEGRATIONS.every((i) => ['manual-links', 'planned'].includes(i.status))).toBe(true);
  });
});

describe('parseJiraLink', () => {
  it('extracts the issue key from common URL shapes', () => {
    expect(parseJiraLink('https://empresa.atlassian.net/browse/DF-123')?.label).toBe('DF-123');
    expect(
      parseJiraLink(
        'https://empresa.atlassian.net/jira/software/projects/DF/boards/1?selectedIssue=DF-45',
      )?.label,
    ).toBe('DF-45');
    expect(parseJiraLink('https://jira.local.dev/projects/OPS/issues/OPS-7')?.label).toBe('OPS-7');
  });

  it('falls back to the host and rejects unsafe URLs', () => {
    expect(parseJiraLink('https://empresa.atlassian.net/jira/your-work')?.label).toBe(
      'empresa.atlassian.net',
    );
    expect(parseJiraLink('http://empresa.atlassian.net/browse/DF-1')).toBeNull();
    expect(parseJiraLink('not a url')).toBeNull();
  });
});

describe('parseSlackLink', () => {
  it('labels message and thread permalinks', () => {
    expect(
      parseSlackLink('https://acme.slack.com/archives/C024BE91L/p1729871234000200')?.label,
    ).toBe('acme · C024BE91L · thread');
    expect(parseSlackLink('https://acme.slack.com/archives/C024BE91L')?.label).toBe(
      'acme · C024BE91L',
    );
  });

  it('falls back to the host for other links', () => {
    expect(parseSlackLink('https://app.slack.com/client/T1/C2')?.label).toBe('app.slack.com');
    expect(parseSlackLink('javascript:alert(1)')).toBeNull();
  });
});
