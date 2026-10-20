# CDLS brand and design system

Lane A (design) deliverable for the rebuild of the Collège de la Salle, Daher platform. Read with `docs/brainstorm.md` (roles, sitemap, data model; in the main checkout, not committed yet) and the FigJam board https://www.figma.com/board/OQ518A0iBOWrry0cahLyfC.

- **Figma file:** [CDLS: Design system & screens](https://www.figma.com/design/yFkLrkPr3tbhkhhbqf42pm). It is in "Mohamed Adel's team", Starter plan.
- **Status (19 Oct 2026):** the tokens and components are built. The screens are **not built yet**. Figma stopped the MCP at the Starter plan limit of 20 tool calls per month. See [Open decisions](#open-decisions).

| Page / section | Link |
|---|---|
| Foundations sheet (colour, type, spacing, radius) | [node 7:104](https://www.figma.com/design/yFkLrkPr3tbhkhhbqf42pm?node-id=7-104) |
| Brand (placeholder crest, wordmark) | [node 3:101](https://www.figma.com/design/yFkLrkPr3tbhkhhbqf42pm?node-id=3-101) |
| Icons | [node 3:2](https://www.figma.com/design/yFkLrkPr3tbhkhhbqf42pm?node-id=3-2) |
| Actions & status (Button, Badge) | [node 3:127](https://www.figma.com/design/yFkLrkPr3tbhkhhbqf42pm?node-id=3-127) |
| Forms, navigation & data (Input, Tab, Tabs, Table cell, Grade cell, Card) | [node 5:10](https://www.figma.com/design/yFkLrkPr3tbhkhhbqf42pm?node-id=5-10) |
| Navigation, layout & overlays (Nav link, Header, Footer, App bar, Bottom nav, Modal, Empty state) | [node 6:17](https://www.figma.com/design/yFkLrkPr3tbhkhhbqf42pm?node-id=6-17) |
| Photography (repo photos placed in the file) | [node 7:249](https://www.figma.com/design/yFkLrkPr3tbhkhhbqf42pm?node-id=7-249) |
| Screens: desktop 1440 (empty) | page `Screens: desktop 1440` |
| Screens: mobile 390 (empty) | page `Screens: mobile 390` |

---

## 1. Asset inventory

I downloaded nothing from the web. The only images in Figma are photos already in this repo, on `main` under `public/images/`, uploaded into the private Figma file for mock-ups.

### Logo and crest

| Asset | Source | Size / quality | Rights |
|---|---|---|---|
| School shield, "DE LA SALLE": gold field, Lasallian star on royal blue, three chevrons on red-orange, white peaks, blue border | Official site, every page: http://www.lasalle-eg.net/images/dls%20logo.JPG. In the repo as `public/images/school/logo-source.jpg` (commit 7f375f1) and as the favicon and icons | 5,179-byte JPEG, about 140×172. **No vector or high-resolution version exists online.** | The school's own mark. **Needs written permission from the school** (delasalle@lasalle-eg.net, +20 2 2590 47 40). The site has no copyright notice, but it blocks right-click ("Vous n'avez pas le droit d'utiliser le bouton droit"). |
| Facebook profile picture of @delasalleegypte | https://www.facebook.com/delasalleegypte/ (official, linked from lasalle-eg.net; about 38.5k followers) | og:image suggests about 1856×2048. I didn't view it, so it isn't confirmed to be the crest. | Same as above. This is the best lead for a high-resolution file: ask the school for the original. |
| "La ★ Salle" mark on the Bac section site | http://bacdelasalle.com/wp-content/uploads/2018/08/laSalleS4.png (8 KB) | Not viewed | Probably the international Lasallian corporate mark. The Institute's rules apply (below). Site © Business Link Solutions 2018. |
| District logo, Proche-Orient | https://lasalle-po.org/wp-content/uploads/2018/11/logo-proche-orient.png (206×89) | The district's own logo, not Daher's | Don't use for the school. |

**No motto** appears on the crest or the official site. The site's only tagline is "Etablissement scolaire fondé par les frères des écoles chrétiennes en 1898".

**Temporary crest (in Figma, `Brand/Crest`).** It is a simplified reading of the shield, for layout only:
- a navy shield with a thin gold inner rule
- a gold Lasallian star
- three ivory peaks

It is labelled PLACEHOLDER and must be swapped for the official vector once the school supplies one and confirms usage. The wordmark sets "Collège de la Salle" in Cormorant Garamond, with "Daher, Le Caire, depuis 1898" below it.

### Lasallian heritage

| Item | Source | Notes |
|---|---|---|
| Signum Fidei star and seal (the Institute motto, "Sign of Faith") | https://branding.lasalle.org/ (2021 Identity Manual; the site was down on 19 Oct, so I read the Wayback copy of 17 May 2026) | Redrawn seal plus the corporate mark "La ★ Salle". The manual PDF isn't public; districts request it from comunicazione@lasalle.org. New derived logos must be authorized by the Institute's Communication service. |
| "Indivisa Manent" | La Salle family arms, under Signum Fidei on the Brothers' coat of arms (https://delasalle.lk/?p=911, https://www.lasalle.org/en/indivisa-manent-a-gift-and-a-challenge-for-lasallians-in-mexico/) | Heritage text, usable in copy. |
| Institutional colours | Brand site CSS: blue about **#1B2C65**, grey #636466 (75% black) | No official hex values are published. Our navy #13294B sits next to the Institute blue on purpose. |
| Indivisa font family | https://indivisafont.org/ | Free to Lasallian schools. A possible future display face if the school wants the network's typography. |

### Photography

| Photo | Page / source | Rights |
|---|---|---|
| `campus-aerien`, `batiment-brique`, `construction-1954` | https://lasalle-po.org/2026/04/10/de-la-salle-daher-memories-2/ | In the repo with credit "Frères des Écoles Chrétiennes – Proche-Orient". `photos.ts` says they were "downloaded with the school's approval for this site". Posts by alumnus George Boghossian; no photographer named; probably reposted from Facebook. |
| `inauguration-1955`, `inauguration-1955-discours` | https://lasalle-po.org/2026/01/19/de-la-salle-dahermemories-the-inauguration-of-the-new-buildings-built-early-1950s/ | Same as above. |
| `freres-1926` | https://lasalle-po.org/2026/03/09/de-la-salle-daher-memories/ | Same as above. |
| 20 archive photos (`public/images/archives/*`: 1907 campus, chapel, classroom…) | http://www.lasalle-eg.net/college/album.htm (originals under /college/arch/) | The school's own album. Small (10–60 KB) early-2000s scans. Credit "Collège De La Salle – Égypte". |
| Star sign on the façade (3 photos) | https://lasalle-po.org/2025/11/13/35611/ | Not in the repo. Needs the school's permission. Good detail shots of the star. |
| Chapel by Stephen Jeter (2008) | https://www.flickr.com/photos/79825916@N00/2829368696 | All rights reserved. **Don't use.** |
| "College de la Salle (Freres) Cairo" by IgorT (2009), 3264×2448 | https://commons.wikimedia.org/wiki/File:College_de_la_Salle_(Freres)_Cairo.jpg | CC Attribution, the only freely licensed photo found. **It may show Bab el-Louk, not Daher.** Check with the school before use. |

**Photography gap.** No current high-resolution photos exist: the hero, the courtyard, students in class and the chapel interior are all missing. Every repo image is ≤1,166 px wide. A one-day photo shoot on campus (with consent forms for students) is the biggest single upgrade to the site.

**Not found:**
- No Instagram account.
- No published school colours or uniform colours.
- No source for the 1905 red-brick date beyond the school administration (already noted in `school-info.ts`).

Other social accounts:
- https://www.facebook.com/collegedelasalle/ (about 9.9k followers, unverified)
- https://www.facebook.com/delasalledaher.sectionfrancaise/ (Bac section, about 3.9k followers)

---

## 2. Design direction

**Classic-modern, rooted in the shield and the building.** These come from the school, not a template:
- the navy, gold and star of the crest
- the red brick of the 1905 building
- the Garamond of the French Lasallian tradition

The school's colours are royal blue, yellow and red-orange. They become a deeper, quieter navy, an antique gold and a brick red that stays in the background.

**The one bold thing:** the history timeline. Large Garamond years in brick red sit on a gold rule, marked with small Lasallian stars, next to archive photographs. Everything around it stays quiet: ivory paper, generous margins, no gradients as decoration, no card shadows at rest.

**What I avoided:**
- terracotta accents
- all-caps eyebrow labels
- `A · B · C` meta strings
- arrows in button labels
- a "big number + small label" hero
- identical rounded cards everywhere (radius varies with hierarchy)

### Colour tokens

Primitives live in the Figma collection `Primitives`. Semantic tokens live in `Color` (one Light mode) and alias the primitives. Web code syntax is `var(--color-…)`.

| Name | Token | Hex | Role |
|---|---|---|---|
| Bleu Daher | `navy/900` | `#13294B` | Brand, headings, primary buttons, app bar, footer |
| Bleu encre | `navy/700` | `#22406E` | Hover, links, focus ring |
| Or du blason | `gold/500` | `#C9A13B` | Accent: rules, star, button and text **on navy only** |
| Or patiné | `gold/700` | `#806218` | Gold as text on light backgrounds. Darkened from `#8A6A1E` (4.25:1 on parchment failed Axe); the Figma variable still holds the old value until the next Figma session. |
| Brique 1905 | `brick/700` | `#8E3A2B` | Heritage accent: timeline years, history |
| Ivoire | `ivory/50` | `#FBF8F1` | Page background |
| Parchemin | `parchment/100` | `#F1EBDD` | Alternate sections, table headers, disabled fills |
| Encre | `ink/900` | `#1E2430` | Body text |

Supporting colours:
- `ink/600` `#565D6B`: muted text
- `stone/300` `#D8CFBD`: dividers
- `stone/500` `#8C8471`: input borders
- `navy/100` `#E3E9F2`: info
- `green/700` `#2E6B45` on `green/100` `#E4EEE6`
- `red/700` `#A3262A` on `red/100` `#F7E4E1`
- `gold/800` `#73570F` on `gold/100` `#F4EAD0`
- `white`

Semantic tokens:
- `bg/page`, `bg/subtle`, `bg/surface`, `bg/inverse`, `bg/accent`, `bg/info`, `bg/success`, `bg/danger`, `bg/warning`
- `action/primary`, `action/primary-hover`, `action/accent`, `action/danger`
- `text/primary`, `text/muted`, `text/heading`, `text/link`, `text/inverse`, `text/accent`, `text/on-inverse-accent`, `text/heritage`, `text/success`, `text/danger`, `text/warning`
- `border/default`, `border/strong`, `border/focus`, `border/accent`, `border/danger`

### Contrast results (WCAG 2.1)

Normal text needs 4.5:1. Large text and UI parts need 3:1.

| Foreground | Background | Ratio | Result |
|---|---|---|---|
| Encre `#1E2430` | Ivoire / Parchemin / white | 14.66 / 13.08 / 15.55 | AA, AAA |
| Muted `#565D6B` | Ivoire / Parchemin / white | 6.24 / 5.57 / 6.62 | AA |
| Bleu Daher `#13294B` | Ivoire / Parchemin / white | 13.69 / 12.21 / 14.52 | AA, AAA |
| Bleu encre `#22406E` (links) | Ivoire / Parchemin / white | 9.77 / 8.72 / 10.36 | AA, AAA |
| Ivoire | Bleu Daher | 13.69 | AA, AAA |
| Or du blason `#C9A13B` | Bleu Daher | 5.98 | AA |
| Bleu Daher (gold button label) | Or du blason | 5.98 | AA |
| Or patiné `#806218` | Ivoire / Parchemin / white | 5.38 / 4.80 / 5.71 | AA |
| Brique `#8E3A2B` | Ivoire / Parchemin | 7.10 / 6.33 | AA |
| Success `#2E6B45` | `#E4EEE6` | 5.35 | AA |
| Danger `#A3262A` | `#F7E4E1` / white | 5.98 / 7.32 | AA |
| Warning `#73570F` | `#F4EAD0` | 5.66 | AA |
| Bleu Daher | Info `#E3E9F2` | 11.89 | AA, AAA |
| Input border `#8C8471` | Ivoire / white | 3.50 / 3.71 | 3:1 UI, pass |
| Focus ring `#22406E` | Ivoire | 9.77 | 3:1 UI, pass |
| **Or du blason** | **Ivoire** | **2.29** | **Fail. Rule: gold is never text, an icon or a sole indicator on light backgrounds. Use it only for decoration there (rules, star marker), or switch to Or patiné.** |

### Type

| Style | Face | Size / line height | Use |
|---|---|---|---|
| Display/XL | Cormorant Garamond Medium | 72/76, -1 tracking (mobile 44/48) | Home hero only |
| Display/L | Cormorant Garamond Medium | 56/60 | Page titles, timeline years |
| Heading/1 | Cormorant Garamond SemiBold | 40/46 (mobile 32/38) | Section titles |
| Heading/2 | Cormorant Garamond SemiBold | 30/36 | Sub-sections, dialog titles |
| Heading/3 | Inter Semi Bold | 20/28 | Card and panel titles (UI) |
| Body/L | Inter Regular | 18/30 | Intros, public pages |
| Body/M | Inter Regular | 16/26 | Default body |
| Body/S | Inter Regular | 14/22 | Tables, secondary text |
| Label/M | Inter Medium | 15/20 | Buttons, nav, form labels |
| Label/S | Inter Medium | 13/18 | Badges, table headers |
| Caption | Inter Regular | 12/18 | Photo credits, dates |
| Quote | Cormorant Garamond Italic | 26/34 | Pull quotes |
| Arabic/Heading | Cairo Bold | 30/44 | Arabic titles (RTL) |
| Arabic/Body | Cairo Regular | 16/28 | Arabic text (RTL) |

How to use them:
- **Serif headings are for the public site.** In the student, teacher and admin spaces, headings above H2 stay serif, while panels, tables and controls use Inter.
- Cormorant has a small x-height, so it is never used below 24px.
- Numbers in tables and grades use Inter tabular figures (`font-variant-numeric: tabular-nums`).
- Line length is at most 72 characters.

### Spacing, radius, elevation

- **Spacing** (`Spacing & radius` collection), on a 4px base:
  - `space/1` 4, `space/2` 8, `space/3` 12, `space/4` 16, `space/6` 24, `space/8` 32
  - `space/12` 48, `space/16` 64, `space/24` 96, `space/32` 128
- **Radius** follows hierarchy rather than one value everywhere:
  - `radius/sm` 4: buttons, inputs, grade cells
  - `radius/md` 10: cards, panels
  - `radius/lg` 16: modals
  - `radius/full`: badges, avatars
- **Elevation:**
  - None at rest; a 1px stone border separates surfaces.
  - `Elevation/Raised` (navy-tinted, 1/2 + 12/32) is for menus and modals only.

### Layout principles

1. **Grid.**
   - Desktop: 12 columns, 1200px content on a 1440 frame (120px margins), 24px gutters.
   - Mobile: 4 columns, 16px margins.
   - Section rhythm: 96px desktop, 64px mobile.
2. **Alignment.** Left-aligned text everywhere, with no centred paragraphs. Arabic mirrors fully (`dir="rtl"`).
3. **Photography is the decoration.** Use large, real photos of Daher with a navy scrim for text. Every photo shows its credit as a caption.
4. **One primary action per view.** Use the navy button, or the gold button on navy surfaces. Everything else is secondary or tertiary.
5. **Never colour alone.** The current nav item has an underline. A selected tab has a 3px rule. Status badges carry a text label. Errors have an icon and a message.
6. **Focus is always visible.** Show a 2px ivory gap plus a 2px `navy/700` ring (`outline: 2px solid; outline-offset: 2px`). Targets are at least 44×44px.
7. **Motion.** One hero fade on load at most, and respect `prefers-reduced-motion`. Motion otherwise only answers actions: dialog open, row saved.
8. **Microcopy.**
   - French, sentence case, active verbs ("Publier les notes", "Envoyer le message").
   - Actions keep their names through a flow.
   - Errors say how to fix the problem.
   - Empty states say what will appear and offer the next action.

### Components built in Figma

All of them are bound to variables (fills, strokes, padding, gaps, radii) and use the text styles.

| Component | Variants / properties |
|---|---|
| Button | Style: Primary, Secondary, Tertiary, On dark. State: Default, Hover, Focus, Disabled. `Label` text property. |
| Badge | Tone: Neutral, Info, Success, Warning, Danger, Heritage. `Label`. |
| Input | State: Default, Focus, Error, Disabled. `Label`, `Value`, `Helper`. |
| Tab, Tabs | Tab State: Selected, Default, Focus. Tabs is a composed bar. |
| Table cell | Type: Header, Body, Body numeric. |
| Grade cell | State: Filled, Empty, Focus, Error, Absent (88×40, /20 scale, decimal comma). |
| Card | Type: News (image, date, title, excerpt, link), Panel (dashboard container). `Title`. |
| Nav link | Tone: Light, Dark. State: Default, Current. |
| Header | Viewport: Desktop (utility strip with Arabic switch, plus main bar), Mobile (menu button). |
| Footer | Viewport: Desktop, Mobile. |
| App bar | Viewport: Desktop (role nav, notifications, account), Mobile. |
| Bottom nav | 5 items for the spaces on mobile. |
| Modal | `Title`. Grade-publishing example. |
| Empty state | `Title`, `Description`. |
| Brand/Crest, Brand/Wordmark | Wordmark Tone: On light, On dark. |
| Icon/* | 22 line icons, 24px (Lucide-derived, ISC). |

**Not built yet** because of the rate limit:
- a `Select` and a `Textarea` component (same anatomy as Input)

---

## 3. Screens: specification for the Figma build

These are blocked by the rate limit. Each screen is planned at 1440 (desktop page) and 390 (mobile page), composed only from the components above.

1. **Home (public).**
   - Header.
   - **Hero:** the full-bleed aerial photo with a navy scrim on the left. A gold 64px rule, then Display/XL "Un collège lasallien au cœur du Caire, depuis 1898". Then a Body/L sentence about 2,400 pupils and the two baccalauréats. The gold "Préparer une inscription" button sits beside an ivory "Découvrir notre histoire" link, with the photo credit in the corner.
   - **History:** on parchment, "Plus d'un siècle à Daher" plus an intro, then the timeline. It shows 1898, 1905, 1955 and 2013 in brick Display/L on a gold rule with star markers, with the 1905 and 1955 archive photos.
   - **Tracks:** "Deux baccalauréats, un même projet éducatif". Two cards (Bac nationale and Bac français) with a photo, a gold-patina kicker, three facts and a Secondary CTA.
   - **News:** three News cards.
   - **Admissions and contact:** navy. Address, hours, email and per-cycle phone numbers on the left. A white form card on the right: name, email, track select, message, "Envoyer le message".
   - Footer.
   - Mobile stacks everything: the hero uses Display at 44, the timeline goes vertical with the rule on the left, and the cards go full width.
2. **Login.**
   - Desktop splits in two: the brick building photo with a navy scrim and the quote "Signum Fidei" on the left, the form on ivory on the right.
   - The form: crest, "Connexion à votre espace", an Identifiant (email) input, a password input with a show/hide button, "Se connecter" (Primary, full width), and "Mot de passe oublié ? Contactez le secrétariat."
   - The error state is an inline Danger message: "Identifiant ou mot de passe incorrect. Vérifiez la saisie ou contactez le secrétariat."
   - There is no sign-up: accounts are created by the admin.
3. **Student dashboard.**
   - App bar with the student nav.
   - Page title "Bonjour Nadia" (Heading/1) and the date.
   - A 3-column grid:
     - **Aujourd'hui:** a timetable list of times, subjects and rooms.
     - **Devoirs à rendre:** checkbox rows with due-date badges.
     - **Dernières notes:** subject, grade /20 and class average, with a Badge "Nouvelle".
   - Below: averages by subject as a table with the term Tabs, and an Absences summary.
   - Mobile has a single column and the Bottom nav.
4. **Teacher grade entry grid.**
   - App bar with the teacher nav.
   - Breadcrumb "2de B, Mathématiques".
   - Title "Contrôle n° 3 : fonctions affines", with its date, coefficient and "Barème /20".
   - The grid: a sticky student-name column, then Grade cells per assessment, then the computed average (right-aligned, tabular).
   - Row states: Absent and Error, with a message under the row ("La note doit être comprise entre 0 et 20.").
   - A toolbar shows a "Brouillon, invisible pour les élèves" Badge (Warning), "Enregistré à 10 h 42", a Secondary "Exporter" button and a Primary "Publier les notes" button that opens the Modal.
   - Mobile shows one student per card with a stepper, and "Publier" in a sticky footer.
5. **Admin users list.**
   - App bar with the admin nav.
   - Title "Utilisateurs", Tabs (Élèves, Enseignants, Administration), a search input and filters (class, track).
   - A table: name, identifiant, role/class, status Badge (Actif / Invitation envoyée / Désactivé) and a row action menu.
   - Pagination: "1–25 sur 2 412".
   - Primary "Ajouter un utilisateur" and Secondary "Importer un CSV".
   - The empty-search state uses the Empty state component.
   - Mobile turns the rows into a list with a name, role and badge.

---

## Open decisions

1. **Figma limit (blocks the screens).** "Mohamed Adel's team" is on the **Starter** plan and your seat there is **View**. Figma's MCP allows **20 tool calls per month** for Starter or View/Collab, and this build used them up. To finish, choose one:
   - Upgrade the team to **Professional** and give your account a **Full or Dev seat**. The MCP limit then becomes up to 200 calls per day (10 per minute).
   - Wait for the monthly reset.
   - Allow the build in another workspace, for example StudentGator, where you have a Dev seat on a Pro plan.
2. **Logo rights.** Ask the school for written permission and the original logo file, ideally vector (AI, EPS, SVG or PDF), or the high-resolution image behind the Facebook profile picture. Until then, the placeholder crest stays.
3. **Photo rights.** Confirm that the approval noted in `photos.ts` covers the new platform. Consider a campus photo shoot.
4. **Palette sign-off.** Navy `#13294B` with gold `#C9A13B` and brick `#8E3A2B` on ivory, as above.
