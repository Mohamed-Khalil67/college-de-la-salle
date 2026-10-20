import { describe, expect, it } from 'vitest';
import {
  bulkHandledNotice,
  formatReceived,
  handledQuery,
  isMessageFilter,
  keepSelectable,
  mailtoAddress,
  pageAfterRemoval,
  replyMailto,
  selectAllState,
  selectableIds,
  toggleSelected,
} from './messages-format';

describe('messages page helpers', () => {
  it('maps each tab to the handled filter of the API', () => {
    expect(handledQuery('waiting')).toBe(false);
    expect(handledQuery('handled')).toBe(true);
    expect(handledQuery('all')).toBeUndefined();
    expect(isMessageFilter('waiting')).toBe(true);
    expect(isMessageFilter('spam')).toBe(false);
  });

  it('answers the visitor with « Re : » and the encoded subject', () => {
    expect(replyMailto({ email: 'mariam@example.com', subject: 'Demande d’inscription & visite' })).toBe(
      `mailto:mariam@example.com?subject=${encodeURIComponent('Re : Demande d’inscription & visite')}`,
    );
  });

  it('keeps a crafted address from adding headers to the reply', () => {
    expect(mailtoAddress('a?bcc=x%40evil.test&b@example.com')).toBe('a%3Fbcc%3Dx%2540evil.test%26b@example.com');
    expect(replyMailto({ email: 'a?cc=x@example.com', subject: 'S' })).toBe('mailto:a%3Fcc%3Dx@example.com?subject=Re%20%3A%20S');
    expect(mailtoAddress('mariam.saad+cdls@example.com')).toBe('mariam.saad%2Bcdls@example.com');
  });

  it('dates a message in Cairo time', () => {
    // 07:14 UTC is 10:14 in Cairo (summer time, UTC+3).
    expect(formatReceived('2026-07-20T07:14:00.000Z')).toBe('20 juillet 2026 à 10 h 14');
    expect(formatReceived('2026-12-01T22:05:00.000Z')).toBe('2 décembre 2026 à 0 h 05');
  });

  it('only lets waiting messages be selected', () => {
    expect(
      selectableIds([
        { id: 'a', handledAt: null },
        { id: 'b', handledAt: '2026-10-20T08:00:00.000Z' },
        { id: 'c', handledAt: null },
      ]),
    ).toEqual(['a', 'c']);
  });

  it('adds and removes ids without changing the previous selection', () => {
    const before = new Set(['a']);
    const added = toggleSelected(before, 'b', true);
    expect([...added]).toEqual(['a', 'b']);
    expect([...toggleSelected(added, 'a', false)]).toEqual(['b']);
    expect([...before]).toEqual(['a']);
    expect(toggleSelected(before, 'a', true)).not.toBe(before);
  });

  it('forgets selected messages that left the page or are no longer waiting', () => {
    expect([...keepSelectable(new Set(['a', 'gone', 'c']), ['a', 'b', 'c'])]).toEqual(['a', 'c']);
    expect(keepSelectable(new Set(['a']), []).size).toBe(0);
  });

  it('tells whether the whole page is selected', () => {
    expect(selectAllState(new Set(), ['a', 'b'])).toBe('none');
    expect(selectAllState(new Set(['a']), ['a', 'b'])).toBe('some');
    expect(selectAllState(new Set(['a', 'b', 'elsewhere']), ['a', 'b'])).toBe('all');
    expect(selectAllState(new Set(['elsewhere']), ['a'])).toBe('none');
  });

  it('confirms a bulk handling, and says why some messages were skipped', () => {
    expect(bulkHandledNotice(3, 3)).toBe('3 messages marqués comme traités.');
    expect(bulkHandledNotice(1, 1)).toBe('1 message marqué comme traité.');
    expect(bulkHandledNotice(1, 2)).toBe('1 message marqué comme traité. Un autre l’était déjà ou a été supprimé.');
    expect(bulkHandledNotice(2, 5)).toBe('2 messages marqués comme traités. 3 autres l’étaient déjà ou ont été supprimés.');
    expect(bulkHandledNotice(0, 3)).toBe('Aucun message marqué comme traité : ils l’étaient déjà ou ont été supprimés.');
  });

  it('goes back a page when the last messages of a page leave it', () => {
    expect(pageAfterRemoval(3, 1, 1)).toBe(2);
    expect(pageAfterRemoval(2, 4, 4)).toBe(1);
    expect(pageAfterRemoval(2, 4, 3)).toBe(2);
    expect(pageAfterRemoval(1, 1, 1)).toBe(1);
  });
});
