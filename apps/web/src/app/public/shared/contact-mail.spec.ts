import { describe, expect, it } from 'vitest';
import { capitalize, contactMailto, telHref } from './contact-mail';

describe('telHref', () => {
  it('keeps the plus sign and the digits', () => {
    expect(telHref('+20 2 2590 47 40')).toBe('tel:+20225904740');
  });
});

describe('contactMailto', () => {
  const base = { name: 'Mariam Saad', email: 'mariam@example.com', phone: '', subject: '', track: '', message: 'Bonjour' };

  it('addresses the secretariat with a default subject', () => {
    const url = contactMailto('delasalle@lasalle-eg.net', base);
    expect(url.startsWith('mailto:delasalle@lasalle-eg.net?subject=')).toBe(true);
    expect(decodeURIComponent(url.split('subject=')[1].split('&')[0])).toBe('Message depuis le site');
  });

  it('puts the track in the subject and signs the body, skipping empty lines', () => {
    const url = contactMailto('a@b.c', { ...base, subject: 'Demande d’inscription', track: 'Bac français, Seconde' });
    const subject = decodeURIComponent(url.split('subject=')[1].split('&')[0]);
    const body = decodeURIComponent(url.split('body=')[1]);
    expect(subject).toBe('Demande d’inscription, Bac français, Seconde');
    expect(body).toBe('Bonjour\n\n--\nMariam Saad\nmariam@example.com\nFilière et classe : Bac français, Seconde');
  });
});

describe('capitalize', () => {
  it('upper-cases the first letter only', () => {
    expect(capitalize('élèves en 2020-2021')).toBe('Élèves en 2020-2021');
  });
});
