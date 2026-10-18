import { expect, type Page, test } from '@playwright/test';

/*
 * Collège de la Salle — Daher, end to end, on desktop and mobile:
 *  - the site is French and left-to-right everywhere, and the header never moves;
 *  - every page is prerendered, has its photos loaded, no horizontal overflow and no layout shift.
 */

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
      // Lazy images load once in view; never wait forever for one that does not.
      await Promise.race([img.decode().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 5000))]);
    }
    window.scrollTo(0, 0);
    const header = document.querySelector('body > app-root > header, app-root > header')!;
    const brand = document.querySelector('[data-testid="brand"]')!.getBoundingClientRect();
    // Arabic script is allowed only inside content explicitly marked Arabic.
    const strayArabic: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent ?? '';
      if (/[؀-ۿ]/.test(text) && !walker.currentNode.parentElement?.closest('[lang="ar"], [dir="auto"]')) {
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
  // On small screens the menu is a toggle: open it only when it is closed.
  if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) !== 'true') await menu.click();
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navigation principale' });

test('French site with a flat navigation and the two online spaces', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Collège de la Salle');
  await expect(page).toHaveTitle('Collège de la Salle — Daher · Bac nationale & Bac français');
  await checkPage(page);

  await openNav(page);
  await expect(nav(page).getByRole('link')).toHaveText([
    'Accueil', 'Histoire & Patrimoine', 'Bac nationale', 'Bac français', 'Contact',
  ]);
  await expect(page.getByText(/Mode Enseignant|Banque|examens/i)).toHaveCount(0);

  for (const [name, url, title] of [
    ['Bac nationale', /\/bac-nationale$/, 'Bac nationale'],
    ['Bac français', /\/bac-francais$/, 'Bac français'],
  ] as const) {
    await openNav(page);
    await nav(page).getByRole('link', { name }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByTestId('section-title')).toHaveText(title);
    await checkPage(page);
  }

  await openNav(page);
  await page.getByTestId('account-menu').click();
  await page.getByTestId('teacher-link').click();
  await expect(page).toHaveURL(/\/espace-enseignant$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Espace enseignant');
  await checkPage(page);
});

test('the menu is a hamburger below 1280px and a single row of links above', async ({ page }) => {
  await page.goto('/');
  const width = page.viewportSize()!.width;
  const menu = page.getByRole('button', { name: 'Menu' });
  if (width >= 1280) {
    await expect(menu).toBeHidden();
    const tops = await nav(page).getByRole('link').evaluateAll((links) => links.map((l) => Math.round(l.getBoundingClientRect().top)));
    expect(Math.max(...tops) - Math.min(...tops), 'all links on one row').toBeLessThanOrEqual(4);
  } else {
    await expect(menu).toBeVisible();
    await expect(nav(page)).toBeHidden();
    await menu.click();
    await expect(nav(page)).toBeVisible();
  }
});

test('no layout shift on any page (fonts preloaded with metric fallback, photos in reserved boxes)', async ({ page }, testInfo) => {
  await trackLayoutShift(page);
  for (const path of ['/', '/histoire', '/bac-nationale', '/bac-francais', '/contact', '/espace-eleve', '/espace-enseignant']) {
    await page.goto(path);
    const cls = await layoutShift(page);
    testInfo.annotations.push({ type: `CLS ${path}`, description: cls.toFixed(4) });
    expect(cls, `layout shift on ${path}`).toBeLessThanOrEqual(0.001);
  }
});

test('every page is prerendered with its content, French metadata and real school photos', async ({ page, request }) => {
  for (const [path, text] of [
    ['/', 'Les enseignants publient'],
    ['/histoire', 'Les grandes étapes'],
    ['/bac-nationale', 'Un collège bilingue, ouvert à tous'],
    ['/bac-francais', 'L’homologation AEFE'],
    ['/contact', 'Standard'],
  ] as const) {
    const html = await (await request.get(path)).text();
    expect(html, `${path} is prerendered`).toContain(text);
    expect(html).toMatch(/<html[^>]*lang="fr"[^>]*dir="ltr"/);
    expect(html).toContain('name="description"');
    if (path !== '/contact') expect(html, `${path} has photos`).toMatch(/\/images\/(school|archives)\//);
  }

  // The photos are served, and credited on the page.
  const files = [
    ...['campus-aerien', 'batiment-brique', 'construction-1954', 'inauguration-1955', 'inauguration-1955-discours', 'freres-1926'].map((f) => `school/${f}`),
    ...['campus-1907', 'campus-1954', 'chantier-batiments-1', 'chantier-batiments-2', 'chantier-batiments-3', 'chantier-batiments-4', 'chapelle-chantier-1', 'chapelle-chantier-2', 'chapelle-chantier-3', 'chapelle-coupole', 'chapelle-facade', 'automobile', 'salle-de-classe', 'bureau', 'nef-archive', 'entree-1', 'entree-2', 'entree-3', 'batiment-ancien', 'terrain'].map((f) => `archives/${f}`),
  ];
  for (const file of files) {
    const res = await request.get(`/images/${file}.jpg`);
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
  await expect(years).toHaveText(['1898', '1905', '1907', '1926', '1954', '1955', '1957', '1958', '2009', '2013']);
  await expect(page.getByTestId('founder-dates')).toContainText('30 avril 1651');
  await expect(page.getByTestId('directors-freres').locator('tbody tr')).toHaveCount(22);
  await expect(page.getByTestId('directors-laics').locator('tbody tr')).toHaveCount(4);
  await expect(page.getByTestId('gallery').locator('img')).toHaveCount(26);
  await expect(page.getByText('26 novembre 1955', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Source : Archives lasalliennes (lasalle-po.org)').first()).toBeVisible();
  await checkPage(page);
});

test('one account pill: it opens with both spaces, Escape closes it, a choice navigates', async ({ page }) => {
  await page.goto('/');
  await openNav(page);
  const pill = page.getByTestId('account-menu');
  await expect(pill).toContainText('Se connecter');
  await expect(pill).toHaveAttribute('aria-expanded', 'false');
  await pill.click();
  await expect(pill).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('account-link')).toContainText('Espace élève');
  await expect(page.getByTestId('teacher-link')).toContainText('Espace enseignant');

  await page.keyboard.press('Escape');
  await expect(pill).toHaveAttribute('aria-expanded', 'false');
  await expect(pill).toBeFocused();

  // A click elsewhere closes it too.
  await pill.click();
  await page.getByRole('heading', { level: 1 }).click();
  await expect(pill).toHaveAttribute('aria-expanded', 'false');

  await pill.click();
  await page.getByTestId('account-link').click();
  await expect(page).toHaveURL(/\/espace-eleve$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Espace élève');
});
