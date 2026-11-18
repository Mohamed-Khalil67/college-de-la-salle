import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { DEFAULT_LANG, ENABLED_LANGS, LANG_META } from '../src/app/i18n/lang';
import { pageUrl, PRERENDERED_PAGES } from '../src/app/i18n/pages';
import { PROFILE } from './school';

/**
 * Smoke test of any school pack (`SCHOOL=<id> npm run build`, then `npm run e2e:smoke -w @cdls/web`): every prerendered
 * public page, in every language the profile enables, opens in the right language and direction, has one h1, shows
 * the school's own name, and passes Axe at 390 and 1440 px. It needs no API or database (static server).
 */
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

for (const lang of ENABLED_LANGS) {
  for (const page of PRERENDERED_PAGES) {
    test(`${lang} ${page}: language, one h1, the school's name, Axe at 390 and 1440 px`, async ({ page: tab }) => {
      await tab.goto(pageUrl(lang, page));
      await expect(tab.locator('html')).toHaveAttribute('lang', lang);
      await expect(tab.locator('html')).toHaveAttribute('dir', LANG_META[lang].dir);
      await expect(tab.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(tab.locator('.wordmark__name').first()).toHaveText(PROFILE.names[PROFILE.nameLang].full);
      expect(await tab.title()).toContain(PROFILE.names[lang].full);
      if (PROFILE.id !== 'cdls-daher') {
        // Nothing of the school the platform was first built for may show on another school's pages.
        const text = (await tab.locator('body').innerText()).toLowerCase();
        for (const word of ['daher', 'la salle', 'lasalle', 'lasall', 'دي لا سال']) expect(text).not.toContain(word);
      }
      for (const size of VIEWPORTS) {
        await tab.setViewportSize(size);
        await tab.waitForTimeout(150);
        const results = await new AxeBuilder({ page: tab })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
          .analyze();
        expect(
          results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
          `Axe on ${lang} ${page} at ${size.width} px`,
        ).toEqual([]);
      }
    });
  }
}

test(`the default language is ${DEFAULT_LANG} and the home page shows the school's address`, async ({ page }) => {
  await page.goto(pageUrl(DEFAULT_LANG, 'home'));
  await expect(page.locator('body')).toContainText(PROFILE.contacts.address[DEFAULT_LANG]);
  await expect(page.locator('body')).toContainText(PROFILE.contacts.switchboard);
});
