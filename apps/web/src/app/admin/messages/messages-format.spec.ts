import { describe, expect, it } from 'vitest';
import { formatReceived, handledQuery, isMessageFilter, mailtoAddress, replyMailto } from './messages-format';

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
});
