# Accessibility

The public statement is the page **Déclaration d'accessibilité** (`/accessibilite`, `/en/accessibility`,
`/ar/accessibility`, linked in every footer). Its text is in the `accessibility` section of
`apps/web/src/app/i18n/messages.<lang>.ts`, in the shape of an RGAA statement: status, what is tested, known
limitations, test environment, contact, remedies.

## Why the status says « non conforme »

The RGAA only lets a site declare itself conform after an audit of a sample of pages against its criteria
(by the owner, or better by an independent body). Our own tests (Axe at two widths, keyboard, contrast) are strong
but are not that audit, so the honest status is « non conforme (not yet audited) », which is also what the
statement says. When the college commissions an audit, replace the « État de conformité » section with the
result (share of criteria met, sample, date, auditor).

## What is tested, and where

| Check | Where | Run with |
|---|---|---|
| Axe (WCAG 2.0–2.2 A/AA + best practices), 390 and 1440 px, every public page in fr/en/ar, plus the login page with its errors | `apps/web/e2e/public-site.spec.ts` | `npm run build`, then `npm run e2e:public -w @cdls/web` (no database; port 4610) |
| Axe on every screen of the three spaces | `apps/web/e2e/all-screens.spec.ts` and the feature specs | `npm run e2e -w @cdls/web` (needs the stack) |
| Keyboard: skip link, phone menu, Escape (Arabic) | `public-site.spec.ts` | same as the first row |
| Language and direction of every page, hreflang in the prerendered HTML | `public-site.spec.ts` | same as the first row |
| Contrast | tokens in `styles.css` (gold is never text on light surfaces); Axe's `color-contrast` rule | with Axe |

**Not tested yet (the statement says so):** screen readers (NVDA, VoiceOver, TalkBack) with people who use them
daily; zoom and text spacing at 200–400 %; reduced motion; the PDFs below.

## Report-card PDF (checked 23 October 2026)

`apps/api/src/report-cards/report-card.pdf.ts` (pdfmake 0.3.12) produces a one-page A4 PDF. I generated one with
that code and inspected its structure:

- PDF 1.3, **no `/StructTreeRoot`, no `/MarkInfo`, no `/Lang`, no tagged content** (no `BDC`/`MCID`): the file is
  **not a tagged PDF**, so it fails PDF/UA. Headings and the table have no semantic structure for a screen reader.
- It does have real text (embedded Roboto with `/ToUnicode`: the text is selectable and readable, not an image) and
  a document `/Title` (« Bulletin — nom — trimestre »). `/DisplayDocTitle` is not set.
- Mitigation today: the same report card is shown as an accessible web page in the student space
  (`eleve/bulletins`, Axe clean) and can be printed from it. The statement says all of this.
- **Not fixed here** (the API is outside this task). pdfmake does not write tags; options: render the PDF from HTML
  with a tagging renderer (Chromium `Page.printToPDF` with `generateTaggedPDF`), post-process the file, or replace
  the download by the print stylesheet of the web page. Until then keep the limitation in the statement.

## When you change the site

- Keep « 0 Axe violations at 390 and 1440 px » for every new screen (`apps/web/CLAUDE.md`, page checklist).
- If a limitation is fixed or a new one found, update the statement in the three message files and its date
  (`accessibility.updated`).
- The « Aller au contenu » link is `<a cdlsSkipLink>` (`shared/ui/skip-link.ts`), never a bare `<a href="#contenu">`:
  the document's `<base href="/">` resolves that to the home page, so on any other page it left the page.
