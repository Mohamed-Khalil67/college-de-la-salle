import { describe, expect, it } from 'vitest';
import { NOTIFICATION_KINDS } from '@cdls/shared';
import { bellLabel, feedStatus, kindLabel, kindTone, receivedAt } from './notification-view';

describe('notification display', () => {
  it('says the unread count in words', () => {
    expect(bellLabel(0)).toBe('Notifications, aucune non lue');
    expect(bellLabel(1)).toBe('Notifications, 1 non lue');
    expect(bellLabel(4)).toBe('Notifications, 4 non lues');
    expect(bellLabel(250)).toBe('Notifications, plus de 99 non lues');
  });

  it('labels and colours every kind', () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(kindLabel(kind)).toBeTruthy();
      expect(kindTone(kind)).toBeTruthy();
    }
    expect(kindTone('session_cancelled')).toBe('danger');
    expect(kindTone('grade_published')).toBe('success');
  });

  it('dates a notification relative to now, then in Cairo time', () => {
    const now = new Date('2026-10-23T10:00:00Z');
    expect(receivedAt('2026-10-23T09:59:40Z', now)).toBe('à l’instant');
    expect(receivedAt('2026-10-23T09:48:00Z', now)).toBe('il y a 12 min');
    expect(receivedAt('2026-10-23T07:00:00Z', now)).toBe('il y a 3 h');
    expect(receivedAt('2026-10-21T06:30:00Z', now)).toBe('le 21 octobre à 09:30');
  });

  it('describes the feed link', () => {
    const now = new Date('2026-10-23T10:00:00Z');
    expect(feedStatus({ active: false, createdAt: null, lastUsedAt: null }, now)).toContain(
      'Aucun lien actif',
    );
    expect(
      feedStatus({ active: true, createdAt: '2026-10-23T09:00:00Z', lastUsedAt: null }, now),
    ).toBe('Lien actif, créé il y a 1 h. Votre agenda ne l’a pas encore lu.');
    expect(
      feedStatus(
        { active: true, createdAt: '2026-10-23T09:00:00Z', lastUsedAt: '2026-10-23T09:50:00Z' },
        now,
      ),
    ).toContain('Dernière lecture par votre agenda il y a 10 min.');
  });
});
