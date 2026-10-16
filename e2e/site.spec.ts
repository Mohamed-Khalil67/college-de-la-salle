import { expect, type Page, test } from '@playwright/test';

/*
 * Collège de la Salle — Daher, end to end, on desktop and mobile:
 *  - the site is French and left-to-right everywhere; only the Arabic subject's content is RTL,
 *    and the header never moves;
 *  - every page is prerendered, has its photos loaded, no horizontal overflow and no layout shift;
 *  - subject pages carry the full programme, worked examples and status.
 */

const ARABIC = /[؀-ۿ]/;

async function trackLayoutShift(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!entry.hadRecentInput) w.__cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

async function layoutShift(page: Page): Promise<number> {
  await page.waitForLoadState('load');
  return page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return (window as unknown as { __cls: number }).__cls;
  });
}

/** Page-level invariants: French LTR shell, header in place, no overflow, photos loaded, no stray Arabic. */
async function checkPage(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

  const report = await page.evaluate(async () => {
    await document.fonts.ready;
    // Lazy images below the fold: bring each into view so it loads, then check it decoded.
    const images = [...document.querySelectorAll('main img')] as HTMLImageElement[];
    for (const img of images) {
      img.scrollIntoView();
      await img.decode().catch(() => undefined);
    }
    window.scrollTo(0, 0);
    const header = document.querySelector('body > app-root > header, app-root > header')!;
    const brand = document.querySelector('[data-testid="brand"]')!.getBoundingClientRect();
    // Arabic script is allowed only inside content explicitly marked Arabic.
    const strayArabic: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent ?? '';
      if (/[؀-ۿ]/.test(text) && !walker.currentNode.parentElement?.closest('[lang="ar"]')) {
        strayArabic.push(text.trim().slice(0, 60));
      }
    }
    return {
      headerDir: getComputedStyle(header).direction,
      brandLeft: brand.left,
      viewport: document.documentElement.clientWidth,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      brokenImages: images.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.currentSrc || i.src),
      interLoaded: document.fonts.check('16px "Inter Variable"', 'Collège'),
      strayArabic,
    };
  });

  expect(report.headerDir).toBe('ltr');
  expect(report.brandLeft, 'the brand sits on the left on every page').toBeLessThan(report.viewport / 3);
  expect(report.overflowX).toBeLessThanOrEqual(1);
  expect(report.brokenImages).toEqual([]);
  expect(report.interLoaded).toBe(true);
  expect(report.strayArabic).toEqual([]);
}

async function openNav(page: Page): Promise<void> {
  const menu = page.getByRole('button', { name: 'Menu' });
  if (await menu.isVisible()) await menu.click();
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navigation principale' });

test('French site with a flat navigation; only the Arabic subject reads right-to-left', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Collège de la Salle');
  await expect(page).toHaveTitle('Collège de la Salle — Daher · Section arabe');
  await checkPage(page);

  // Flat navigation, in French, with no Teacher Mode and no exam pages.
  await openNav(page);
  await expect(nav(page).getByRole('link')).toHaveText(['Accueil', 'Histoire & Patrimoine', 'Langue arabe', 'Mathématiques', 'Physique-Chimie']);
  await expect(page.getByText(/Mode Enseignant|bank|Banque|examens/i)).toHaveCount(0);

  // Arabic subject: RTL Arabic article, while the header and breadcrumb stay French and LTR.
  await nav(page).getByRole('link', { name: 'Langue arabe' }).click();
  await expect(page).toHaveURL(/\/matiere\/arabe$/);
  const article = page.getByTestId('subject');
  await expect(article).toHaveAttribute('lang', 'ar');
  await expect(article).toHaveAttribute('dir', 'rtl');
  await expect(page.getByTestId('subject-title')).toHaveText('اللغة العربية');
  expect(await page.getByTestId('subject-title').evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Cairo');
  await expect(page.getByRole('navigation', { name: 'Fil d’Ariane' })).toContainText('Accueil');
  await expect(page.getByRole('heading', { name: 'تاريخ اللغة العربية في مصر' })).toBeVisible();
  // The table of contents follows the article to the right; the brand stays on the left.
  const toc = await page.getByTestId('toc').boundingBox();
  const viewport = page.viewportSize()!.width;
  if (viewport >= 1024) expect(toc!.x).toBeGreaterThan(viewport / 2);
  await checkPage(page);

  // French subjects: LTR, Inter.
  await openNav(page);
  await nav(page).getByRole('link', { name: 'Mathématiques' }).click();
  await expect(page.getByTestId('subject')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByTestId('subject-title')).toHaveText('Mathématiques');
  await checkPage(page);

  await openNav(page);
  await nav(page).getByRole('link', { name: 'Physique-Chimie' }).click();
  await expect(page.getByTestId('subject-title')).toHaveText('Physique-Chimie');
  await expect(page.getByTestId('formula').first()).toHaveText('U = R · I');
  await checkPage(page);
});

test('no layout shift on any page (fonts preloaded with metric fallback, photos in reserved boxes)', async ({ page }, testInfo) => {
  await trackLayoutShift(page);
  for (const path of ['/', '/histoire', '/matiere/arabe', '/matiere/mathematiques', '/matiere/physique-chimie']) {
    await page.goto(path);
    const cls = await layoutShift(page);
    testInfo.annotations.push({ type: `CLS ${path}`, description: cls.toFixed(4) });
    expect(cls, `layout shift on ${path}`).toBeLessThanOrEqual(0.001);
  }
});

test('every page is prerendered with its content, French metadata and real school photos', async ({ page, request }) => {
  for (const [path, text] of [
    ['/', 'Les matières'],
    ['/histoire', 'Les grandes étapes'],
    ['/matiere/arabe', 'تاريخ اللغة العربية في مصر'],
    ['/matiere/mathematiques', 'Calcul intégral'],
    ['/matiere/physique-chimie', 'Induction électromagnétique'],
  ] as const) {
    const html = await (await request.get(path)).text();
    expect(html, `${path} is prerendered`).toContain(text);
    expect(html).toMatch(/<html[^>]*lang="fr"[^>]*dir="ltr"/);
    expect(html).toContain('name="description"');
    expect(html).toContain('/images/school/');
  }

  // The photos are served, and credited on the page.
  for (const file of ['campus-aerien', 'batiment-brique', 'construction-1954', 'inauguration-1955', 'inauguration-1955-discours', 'freres-1926']) {
    const res = await request.get(`/images/school/${file}.jpg`);
    expect(res.status(), file).toBe(200);
    expect(res.headers()['content-type']).toContain('image/jpeg');
  }
  await page.goto('/histoire');
  await expect(page.getByText('Photo : Frères des Écoles Chrétiennes – Proche-Orient').first()).toBeVisible();
  await checkPage(page);
});

test('history: milestones in order with archive photos and sources', async ({ page }) => {
  await page.goto('/histoire');
  const years = page.getByTestId('timeline').locator('li > article p.text-4xl');
  await expect(years).toHaveText(['1898', '1905', '1926', '1954', '1955', '1957', '1958']);
  await expect(page.getByText('26 novembre 1955', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Source : Archives lasalliennes (lasalle-po.org)').first()).toBeVisible();
  await checkPage(page);
});

test('a subject page gives the full programme, corrected examples, tips, resources and status', async ({ page }) => {
  await page.goto('/matiere/mathematiques');
  await expect(page.getByTestId('chapter')).toHaveCount(6);
  await expect(page.getByTestId('example')).toHaveCount(5);

  // In-page navigation scrolls to the section, below the sticky header.
  await page.getByTestId('toc').getByRole('link', { name: 'Exercices types corrigés' }).click();
  await expect(page).toHaveURL(/#exercices$/);
  const heading = await page.getByRole('heading', { name: 'Exercices types corrigés' }).boundingBox();
  const header = await page.getByRole('banner').boundingBox();
  expect(heading!.y).toBeGreaterThanOrEqual(header!.height - 2);

  // Corrections are folded until asked for.
  const second = page.getByTestId('example').nth(1);
  await expect(second.getByText('Réponse')).toBeHidden();
  await second.getByText('Voir la correction').click();
  await expect(second.getByText('I = 1')).toBeVisible();

  // Status of the programme: every chapter listed, with an accessible progress bar.
  const status = page.getByTestId('status');
  await expect(status).toContainText('0 chapitre terminé sur 6');
  await expect(status.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '6');
  await expect(status.getByRole('row')).toHaveCount(7);
  await expect(page.getByText('Bientôt disponible').first()).toBeVisible();
  await checkPage(page);
});

test('the Arabic subject page has its full content in Arabic', async ({ page }) => {
  await page.goto('/matiere/arabe');
  await expect(page.getByTestId('chapter')).toHaveCount(6);
  await expect(page.getByRole('heading', { name: 'البلاغة' })).toBeVisible();
  const example = page.getByTestId('example').nth(1);
  await example.getByText('عرض الحلّ').click();
  await expect(example).toContainText('تشبيه بليغ');
  await expect(page.getByTestId('status')).toContainText('أُنجز ٠ من ٦ وحدات');
  const text = await page.getByTestId('subject').innerText();
  expect(ARABIC.test(text)).toBe(true);
  await checkPage(page);
});
