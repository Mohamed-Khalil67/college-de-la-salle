import { describe, expect, it } from 'vitest';
import { CLASSES, classLabel, favouriteId, frenchAuthError, progressPercent } from './student.model';

describe('student model', () => {
  it('offers the right classes per section', () => {
    expect(CLASSES.bac.map((c) => c.label)).toEqual(['Seconde', 'Première', 'Terminale']);
    expect(CLASSES.nationale).toHaveLength(3);
    expect(classLabel('bac', 'premiere')).toBe('Première');
    expect(classLabel('bac', 'inconnue')).toBe('inconnue');
  });

  it('computes progress only over chapters that exist', () => {
    const ids = ['a', 'b', 'c', 'd'];
    expect(progressPercent(undefined, ids)).toBe(0);
    expect(progressPercent(['a'], ids)).toBe(25);
    expect(progressPercent(['a', 'b', 'zzz'], ids)).toBe(50); // unknown ids don't count
    expect(progressPercent(['a', 'b', 'c', 'd'], ids)).toBe(100);
    expect(progressPercent(['a'], [])).toBe(0);
  });

  it('builds stable favourite ids', () => {
    expect(favouriteId('mathematiques', 'ex', 1)).toBe('mathematiques:ex:1');
    expect(favouriteId('physique-chimie', 'fo', 0)).toBe('physique-chimie:fo:0');
  });

  it('explains Firebase errors in French, never leaking codes', () => {
    expect(frenchAuthError({ code: 'auth/email-already-in-use' })).toContain('compte existe déjà');
    expect(frenchAuthError({ code: 'auth/invalid-credential' })).toBe('E-mail ou mot de passe incorrect.');
    expect(frenchAuthError({ code: 'auth/user-not-found' })).toBe('E-mail ou mot de passe incorrect.'); // same message: no account probing
    expect(frenchAuthError({ code: 'auth/weak-password' })).toContain('8 caractères');
    expect(frenchAuthError(new Error('boom'))).toBe('Une erreur est survenue. Réessayez.');
    expect(frenchAuthError(null)).toBe('Une erreur est survenue. Réessayez.');
  });
});
