import { expect, test } from '@playwright/test';

/*
 * The two tracks (Bac nationale and Bac français), their subject catalogue, and the contact page,
 * on desktop and mobile.
 */

test('home offers the two tracks and the two online spaces, and leads to each', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('section-card-nationale')).toBeVisible();
  await expect(page.getByTestId('section-card-bac')).toBeVisible();
  await expect(page.getByTestId('home-student')).toHaveAttribute('href', '/espace-eleve');
  await expect(page.getByTestId('home-teacher')).toHaveAttribute('href', '/espace-enseignant');
  await page.getByTestId('section-card-bac').click();
  await expect(page).toHaveURL(/\/bac-francais$/);
  await expect(page.getByTestId('section-title')).toHaveText('Bac français');
});

test('Bac français: AEFE homologation, pedagogy, headcounts that add up, links to the Bac site', async ({ page }) => {
  await page.goto('/bac-francais');
  await expect(page.getByRole('heading', { name: 'L’homologation AEFE' })).toBeVisible();
  await expect(page.getByText('10 janvier 2013').first()).toBeVisible();
  for (const title of ['Les valeurs fondamentales', 'Accompagner les élèves en difficulté', 'Le renforcement des langues', 'L’orientation', 'Inscription']) {
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  }

  // Headcount table: 3 cycles × 3 levels, total 268 (74 + 87 + 107).
  await expect(page.getByTestId('counts').locator('tbody tr')).toHaveCount(9);
  await expect(page.getByTestId('counts-total')).toHaveText('268');

  // External links open in a new tab, safely, and point to the Bac site's registration forms.
  const inscription = page.getByRole('listitem').filter({ hasText: 'Inscription Bac' }).getByRole('link', { name: /Ouvrir/ });
  await expect(inscription).toHaveAttribute('href', 'https://bacdelasalle.com/inscription/inscription-2-2/');
  await expect(inscription).toHaveAttribute('target', '_blank');
  await expect(inscription).toHaveAttribute('rel', /noopener/);
});

test('Bac nationale: the programme, no app announcement, links to both online spaces', async ({ page }) => {
  await page.goto('/bac-nationale');
  await expect(page.getByTestId('section-title')).toHaveText('Bac nationale');
  await expect(page.getByText('Les matières scientifiques sont enseignées en français', { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/Android|iOS|Google Play|App Store/)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Espace élève' }).last()).toHaveAttribute('href', '/espace-eleve');
  await expect(page.getByRole('link', { name: 'Espace enseignant' }).last()).toHaveAttribute('href', '/espace-enseignant');
});

test('each track shows its own subjects, grouped, with an illustration that loaded', async ({ page }) => {
  await page.goto('/bac-nationale');
  const names = page.getByTestId('matiere-name');
  await expect(names).toHaveCount(14);
  await expect(page.getByTestId('group-Langues').getByTestId('matiere-name')).toHaveText(['Langue arabe', 'Français', 'Anglais']);
  await expect(names.filter({ hasText: 'Psychologie et sociologie' })).toHaveCount(1);
  await expect(names.filter({ hasText: 'Espagnol' })).toHaveCount(0);

  const broken = await page.evaluate(async () => {
    const images = [...document.querySelectorAll<HTMLImageElement>('#matieres img')];
    for (const img of images) {
      img.scrollIntoView();
      await img.decode().catch(() => undefined);
    }
    return { total: images.length, broken: images.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src) };
  });
  expect(broken.total).toBe(14);
  expect(broken.broken).toEqual([]);

  await page.goto('/bac-francais');
  await expect(page.getByTestId('matiere-name')).toHaveCount(15);
  await expect(page.getByTestId('matiere-name').filter({ hasText: 'Espagnol' })).toHaveCount(1);
  await expect(page.getByTestId('matiere-name').filter({ hasText: 'Psychologie' })).toHaveCount(0);
});

test('contact: every department has its number, dialable', async ({ page }) => {
  await page.goto('/contact');
  const rows = page.getByTestId('phones').locator('tbody tr');
  await expect(rows).toHaveCount(9);
  await expect(rows.filter({ hasText: 'Bac français' })).toContainText('+20 2 2592 95 98');
  await expect(page.getByRole('link', { name: '+20 2 2590 47 40' })).toHaveAttribute('href', 'tel:+2022590 4740'.replace(' ', ''));
  await expect(page.getByRole('link', { name: 'delasalle@lasalle-eg.net' })).toHaveAttribute('href', 'mailto:delasalle@lasalle-eg.net');
  await expect(page.getByText('6 El Beshnini St.')).toBeVisible();
});
