import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { SubjectPage } from './subject.page';

function render(slug: string): HTMLElement {
  TestBed.configureTestingModule({ imports: [SubjectPage], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(SubjectPage);
  fixture.componentRef.setInput('slug', slug);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('SubjectPage', () => {
  it('renders the Arabic subject as an RTL Arabic article, with a French breadcrumb', () => {
    const el = render('arabe');
    const article = el.querySelector('article[data-testid="subject"]')!;
    expect(article.getAttribute('lang')).toBe('ar');
    expect(article.getAttribute('dir')).toBe('rtl');
    expect(el.querySelector('nav')!.textContent).toContain('Accueil');
    expect(el.querySelector('[data-testid="subject-title"]')!.textContent).toBe('اللغة العربية');
    expect(el.querySelector('[data-testid="toc"]')!.textContent).toContain('في هذه الصفحة');
  });

  it('renders French subjects left to right, with formulas isolated as LTR', () => {
    const el = render('physique-chimie');
    const article = el.querySelector('article[data-testid="subject"]')!;
    expect(article.getAttribute('lang')).toBe('fr');
    expect(article.getAttribute('dir')).toBe('ltr');
    const formulas = el.querySelectorAll('[data-testid="formula"]');
    expect(formulas.length).toBe(12);
    expect(formulas[0]!.getAttribute('dir')).toBe('ltr');
  });

  it('shows every chapter with its status and the overall progress', () => {
    const el = render('mathematiques');
    expect(el.querySelectorAll('[data-testid="chapter"]').length).toBe(6);
    expect(el.querySelector('[data-testid="chapter-status"]')!.textContent!.trim()).toBe('Prévu');
    expect(el.querySelector('[data-testid="status"]')!.textContent).toContain('0 chapitre terminé sur 6');
    expect(el.querySelector('[role="progressbar"]')!.getAttribute('aria-valuemax')).toBe('6');
  });

  it('builds a table of contents that matches the sections on the page', () => {
    const el = render('mathematiques');
    const links = [...el.querySelectorAll('[data-testid="toc"] a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/#programme', '/#formules', '/#exercices', '/#conseils', '/#ressources', '/#statut']);
    for (const href of links) expect(el.querySelector(href!.replace('/', ''))).not.toBeNull();
  });

  it('shows an explicit message for an unknown subject', () => {
    expect(render('biologie').textContent).toContain('Matière introuvable');
  });
});
