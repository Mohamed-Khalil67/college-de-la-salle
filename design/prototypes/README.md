# CDLS HTML prototypes

These are ten responsive screens in plain HTML and CSS, built on the design tokens from [docs/brand.md](../../docs/brand.md). Front-end lanes port them to Angular components. They are the visual and behavioural reference while the Figma screens are blocked (the Figma MCP limit is used up).

- **Content:** real French copy. School facts come from `src/app/school/*`; pupils, grades and accounts are fictional.
- **Widths:** each screen works from 390 px to 1440 px.
- **Accessibility:** Axe 4.10 reports **0 violations** on every page at 390 and 1440, run with the rule tags wcag2a, wcag2aa, wcag21aa, wcag22aa and best-practice. Keyboard checks are listed below.

## View them

The icon sprite (`icons.svg`) is loaded with `<use href>`, which browsers block on `file://`. Serve the folder instead:

```bash
python -m http.server 4310 --directory design/prototypes
```

Then open http://localhost:4310/ (`index.html` lists every screen).

## Files

| File | What it is |
|---|---|
| `tokens.css` | Every design token as a CSS custom property, named for the Tailwind 4 `@theme` namespaces. The header comment maps Figma variables to properties. |
| `components.css` | Base styles plus one block per component, each with its states: hover, `:focus-visible`, `:disabled`, `[aria-invalid]`, `[aria-current]`, `[aria-selected]`, `:checked`. |
| `icons.svg` | Sprite with 28 line icons (Lucide-derived, ISC) plus the **placeholder** crest (`#crest`, `#crest-on-dark`) and the Lasallian star marker. |
| `app.js` | The minimum behaviour: disclosure menu, ARIA tabs, password toggle, `<dialog>`, grade validation and averages, attendance counts, print. |
| `img/` | Nine photos copied from `public/images/` (archive and Proche-Orient credits, as in `photos.ts`). |
| `index.html` | Hub page. |
| `home.html`, `bac-francais.html`, `contact.html`, `connexion.html` | Public site. |
| `eleve-tableau-de-bord.html`, `eleve-notes.html`, `eleve-bulletin.html` | Student space. |
| `enseignant-saisie-notes.html`, `enseignant-appel.html` | Teacher space. |
| `admin-utilisateurs.html` | Admin. |

The HTML is the source now: edit it directly. Shared chrome (header, footer, app bar, bottom nav) is duplicated in each page on purpose. In Angular it becomes one layout component per area.

## Tokens to Tailwind 4

Paste the first `:root { … }` block of `tokens.css` into `@theme { … }` in the web app's global stylesheet, and skip the "Helpers" block. Nothing else needs renaming:

- `--color-*` gives `bg-page`, `text-heading`, `border-line`, `bg-accent`, `text-heritage`, and so on.
- `--font-display`, `--font-sans` and `--font-arabic` give `font-display`, `font-sans` and `font-arabic`.
- `--text-display-xl`, `--text-h1` … `--text-caption` carry their own line height, letter spacing and weight, so `text-h1` sets all four.
- `--spacing: 0.25rem` means `p-6` = 24px = Figma `space/6`.
- `--radius-sm|md|lg|full` and `--shadow-raised|overlay` work as usual.

**Changed from Figma:** `--color-gold-700` is `#806218`, not Figma's `#8A6A1E`. The old value is 4.25:1 on parchment and failed Axe. Update the Figma variable at the next Figma session.

## Components and how to port them

Every instance in the HTML carries `data-component="name"`. Suggested home: shared UI in `apps/web/src/app/shared/ui/`, feature pieces in the area folders. Follow the root `CLAUDE.md`:
- standalone components
- `input()`, `output()` and `model()`
- signals
- native control flow
- `host` bindings instead of `@HostBinding` and `@HostListener`
- no `ngClass` or `ngStyle`

| `data-component` | Angular shape | Notes |
|---|---|---|
| `button` | Attribute directive on native elements: `button[cdlsButton]`, `a[cdlsButton]` with `variant = input<'primary' \| 'secondary' \| 'tertiary' \| 'on-dark'>()` and `size = input<'md' \| 'sm'>()`. Host `class` bindings. | Keep the native element so keyboard and semantics come free. Icon-only buttons need a visually hidden label. Minimum height 44px. |
| `badge` | `cdls-badge`, `tone = input<'neutral' \| 'info' \| 'success' \| 'warning' \| 'danger' \| 'heritage'>()`, projected label. | The label must carry the meaning; colour only supports it. |
| `field` | `cdls-field` wrapper: `label`, `helper` and `error` inputs, with the native `<input>`, `<select>` or `<textarea>` projected. It generates ids and wires `for`, `aria-describedby` and `aria-invalid`. | Use with Signal Forms (`@angular/forms/signals`). The error message has an icon and says how to fix the problem. |
| `search-field` | Variant of `field` with a leading icon. | Inside a `role="search"` form. |
| `checkbox` | `cdls-checkbox` (native `input[type=checkbox]` styled), implementing the Signal Forms value control or `ControlValueAccessor`. | Used for homework done. |
| `segmented` | `cdls-segmented` radio group: `options = input<…>()`, `value = model<string>()`. Renders a `fieldset` and `legend` with native radios. | Attendance status. The checked state colours are success, danger and warning tints. |
| `tabs` | Prefer the Angular Aria tabs primitives if the project's Angular version ships them; otherwise `cdls-tabs` + `cdls-tab` with roving tabindex as in `app.js`. | ARIA tabs pattern: arrows, Home and End; automatic activation. |
| `data-table` | Plain `<table>` styled by a `cdlsTable` directive, inside a scroll region (`role="region"`, `tabindex="0"`, labelled by the caption). Options: `stickyFirst`, `stack` (phones become stacked rows with `data-label`). | Numbers use `.num` (right-aligned, tabular). Header cells use `scope`. |
| `grade-input` | `cdls-grade-input`, `value = model<number \| null>()`, `absent = input<boolean>()`. Parses with `parseNumber` from `packages/shared` (decimal comma), validates 0 to 20, sets `aria-invalid`. | The row error message lives in the next `<tr>` (see `enseignant-saisie-notes.html`). |
| `card` | `cdls-card`, `variant = input<'news' \| 'panel'>()`, with slots for media, header (title and link) and body. | A news card is one link (the title's link covers the card, so focus goes there). A panel card is a `<section>` labelled by its title. |
| `nav-link` | Plain `<a>` with `routerLink`, `routerLinkActive` and `ariaCurrentWhenActive="page"`. | Shows a 2px underline when current (gold on navy). |
| `wordmark` | `cdls-wordmark`, `tone = input<'light' \| 'dark'>()`, `subtitle = input<string>()`. | The crest is approved as it is. When the text is hidden (app bar on mobile), the link needs an `aria-label`. |
| `site-header` | Public layout header. `menuOpen = signal(false)`. Close it on Escape and on `NavigationEnd`, and return focus to the toggle. | Navy utility strip with the Arabic switch (`lang="ar"`, `hreflang`). |
| `site-footer` | Static. | Lists the credits for logo and photos. |
| `app-bar` | Space layout header. `nav = input<NavItem[]>()` per role, account and notifications. | From 1024px down, the links move to `bottom-nav` and the page title shows instead. |
| `bottom-nav` | `cdls-bottom-nav`, `items = input<NavItem[]>()`, at most 5. | Fixed to the bottom on phones. Add `.has-bottom-nav` padding to the body. |
| `modal` | `cdls-dialog` around native `<dialog>`: `open = model<boolean>()`, `showModal()`/`close()` in an effect, `closed = output()`. | Native `showModal()` traps focus, closes on Escape and makes the page inert. Return focus to the opener. Labelled by the title. |
| `empty-state` | `cdls-empty-state`: `title` and `description` inputs, projected action. | Says what will appear here and offers the next step. |
| `alert` | `cdls-alert`, `tone` input. Use `role="alert"` for errors after a submit and `role="status"` for confirmations. | |
| `breadcrumb`, `pagination` | Small presentational components. | `aria-current="page"` on the current item. |
| `avatar` | Initials with `aria-hidden`; the name is always next to it. | |
| `hero`, `timeline`, `track-card`, `facts`, `page-intro` | Public-site components (`public/` folder). | The timeline is the visual signature: brick years, gold rule, star markers. Years keep Garamond old-style figures; grades and statistics use lining figures. |
| `auth-layout` | Login page layout. | Photo with navy scrim; the caption is ivory, because gold fails on the photo. |
| `report-card` | Feature component in the student space, with a print stylesheet (`@media print` in `components.css`). | The PDF comes from the API (pdfmake); the page and the PDF share the layout. |
| `grade-grid`, `grade-toolbar` | Teacher feature components. The toolbar shows the draft badge and the save status (`role="status"`). | Averages come from `averageOnTwenty` in `packages/shared`, rounded to 1 decimal, as here. |
| `attendance-sheet`, `filters` | Teacher and admin feature components. | Counts are announced through `aria-live="polite"`. |

## Accessibility checks done

- **Axe:** 0 violations on all 11 pages at 390 and 1440. Axe's "incomplete" contrast items are text over photos or gradients. I checked those by hand: ivory on the hero scrim (alpha ≥ 0.84) is at least 8.3:1, and the photo credit has its own navy backing.
- **Keyboard:**
  - The skip link is the first focusable element on every product screen (the `index.html` hub has no navigation, so it has none).
  - The mobile menu opens with Enter, closes with Escape and returns focus to the toggle.
  - Tabs move with the arrow keys.
  - In the grade grid, Tab moves cell to cell. An out-of-range value sets `aria-invalid` and shows the row message.
  - The publish dialog moves focus inside, closes with Escape and returns focus to "Publier les notes".
- **Focus:** a 2px `--color-focus` outline with a 2px offset (gold on navy surfaces).

## Open decisions and known gaps

1. **Logo:** the crest and wordmark are approved as they are; no web logo is needed. An official vector can replace `#crest` later.
2. **Photos:** every photo is low resolution (≤ 1,166 px) and from archives. A campus shoot would replace the hero and the track images.
3. **Figma:** the screens aren't in Figma, and `gold/700` needs updating there (see `docs/brand.md`, Open decisions).
4. **Template reuse:** `bac-francais.html` stands in for both track pages; the Bac nationale page uses the same template. Links to pages that don't exist yet point to `#`.
5. **Mobile grade grid:** on phones it scrolls sideways with a sticky name column. The one-card-per-student version proposed in `brand.md` is an option if teachers mostly enter grades on phones.
