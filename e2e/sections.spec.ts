import { expect, test } from '@playwright/test';

/*
 * The two sections (national and Bac français) and the contact page, on desktop and mobile.
 */

test('home offers the two sections and leads to each', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('section-card-nationale')).toBeVisible();
  await expect(page.getByTestId('section-card-bac')).toBeVisible();
  await page.getByTestId('section-card-bac').click();
  await expect(page).toHaveURL(/\/bac$/);
  await expect(page.getByTestId('section-title')).toHaveText('Section Bac français');
});

test('Bac section: AEFE homologation, pedagogy, headcounts that add up, links to the Bac site', async ({ page }) => {
  await page.goto('/bac');
  await expect(page.getByRole('heading', { name: 'L’homologation AEFE' })).toBeVisible();
  await expect(page.getByText('10 janvier 2013').first()).toBeVisible();
  for (const title of ['Les valeurs fondamentales', 'Accompagner les élèves en difficulté', 'Le renforcement des langues', 'L’orientation', 'Inscription']) {
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  }

  // Headcount table: 3 cycles × 3 levels, total 268 (74 + 87 + 107).
  const counts = page.getByTestId('counts');
  await expect(counts.locator('tbody tr')).toHaveCount(9);
  await expect(page.getByTestId('counts-total')).toHaveText('268');

  // External links open in a new tab, safely, and point to the Bac site's registration forms.
  const inscription = page.getByRole('listitem').filter({ hasText: 'Inscription Bac' }).getByRole('link', { name: /Ouvrir/ });
  await expect(inscription).toHaveAttribute('href', 'https://bacdelasalle.com/inscription/inscription-2-2/');
  await expect(inscription).toHaveAttribute('target', '_blank');
  await expect(inscription).toHaveAttribute('rel', /noopener/);
});

test('national section: bilingual programme, the three subjects, the school app', async ({ page }) => {
  await page.goto('/section-nationale');
  await expect(page.getByTestId('section-title')).toHaveText('Section nationale');
  await expect(page.getByText('Les matières scientifiques sont enseignées en français', { exact: false }).first()).toBeVisible();
  const subjects = page.getByRole('heading', { name: 'Des matières détaillées en ligne' }).locator('xpath=ancestor::section');
  await expect(subjects.getByRole('link')).toHaveCount(3);
  await subjects.getByRole('link', { name: /Mathématiques/ }).click();
  await expect(page).toHaveURL(/\/matiere\/mathematiques$/);

  await page.goto('/section-nationale');
  await expect(page.getByRole('listitem').filter({ hasText: 'Application — Android' }).getByRole('link')).toHaveAttribute('href', /play\.google\.com/);
  await expect(page.getByRole('listitem').filter({ hasText: 'Application — iOS' }).getByRole('link')).toHaveAttribute('href', /apps\.apple\.com/);
});

test('contact: every department has its number, dialable', async ({ page }) => {
  await page.goto('/contact');
  const rows = page.getByTestId('phones').locator('tbody tr');
  await expect(rows).toHaveCount(9);
  await expect(rows.filter({ hasText: 'Section Bac français' })).toContainText('+20 2 2592 95 98');
  await expect(page.getByRole('link', { name: '+20 2 2590 47 40' })).toHaveAttribute('href', 'tel:+2022590 4740'.replace(' ', ''));
  await expect(page.getByRole('link', { name: 'delasalle@lasalle-eg.net' })).toHaveAttribute('href', 'mailto:delasalle@lasalle-eg.net');
  await expect(page.getByText('6 El Beshnini St.')).toBeVisible();
});
