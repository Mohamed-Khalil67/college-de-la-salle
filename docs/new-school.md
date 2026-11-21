# Setting up a new school

The platform is one install per school: each school has its own deployment and its own database (the Docker stack in
`deploy/`), with no shared multi-tenant database. What makes an install « Collège de la Salle » or « École Exemple » is a
**school pack**, a folder `schools/<id>/` at the repository root. Setting up a new school means writing a pack and
building with `SCHOOL=<id>`; no code changes.

Two packs ship with the repository:

| Pack | What it is |
|---|---|
| `schools/cdls-daher/` | Collège de la Salle, Daher, Cairo: everything the site said before packs existed, moved as is. The default. |
| `schools/example/` | École Exemple, a **fictional** school with placeholder text in French, English and Arabic and a text-only monogram. It proves that a second school builds, prerenders and runs, and it is the starting point for yours. |

## What a pack holds

```
schools/<id>/
  profile.json        who the school is (validated: packages/shared/src/school-profile.ts)
  site/               the public site, in TypeScript (checked by the compiler and by apps/web/src/app/school/pack.spec.ts)
    index.ts          SITE: photos and departments the pages point at, home title, motto, contact-form classes
    archive.ts        PHOTOS (file, size, alt, credit) and DIRECTORS
    content.<lang>.ts the long-form text per language: key figures, milestones, founder, tracks, contact labels, photos
    messages.<lang>.ts the words that name the school: page descriptions, hero, history, accessibility statement
    fr.ts en.ts ar.ts one line each: the pack's two files of a language
  public/             files served from the site root: crest.svg, favicon and icons, images/
```

The profile (`profile.json`) holds: `id`, `placeholder`, the school's names per language (`full`, `short`, `place`,
`city`, and `of`, the form used in a sentence: « votre compte du Collège de la Salle »), `nameLang`, `foundingYear`,
the affiliation line, the contacts (address per language, map query, switchboard, e-mail, departments with their
phones), the linked websites, `siteUrl` (the https origin of this platform's site: canonical and hreflang links,
robots.txt, sitemap.xml), `loginEmailDomain`, the IANA `timeZone`, `defaultLanguage`, the enabled `languages`, the
two `sections` (code and name per language), the calendar ids (`uidDomain`, `productName`) and the `brand` (crest,
icons, theme colour, optional colour overrides). Open `schools/example/profile.json` and change every value; the
validator names each field that is wrong, with the file, so a typo stops the build instead of reaching a page.

## Step by step

1. **Copy the example.** `cp -r schools/example schools/<your-id>` (`<your-id>`: lower case, digits and hyphens). Change
   `"id"` and `"placeholder": false` in `profile.json`.
2. **Fill the profile.** Names, address, phones, e-mails, time zone (for example `Europe/Paris`), languages (`fr` is
   the default and the only possible one for now; `en` and `ar` are optional, a school that drops one simply has no
   pages for it), `loginEmailDomain` (the example shown in help texts, normally the same as `SCHOOL_EMAIL_DOMAIN`),
   `siteUrl` (`https://www.<domain>`, no path and no trailing slash). While the domain is not chosen, use a reserved
   placeholder such as `https://<your-id>.invalid`: builds warn, and the Docker image (`CDLS_RELEASE=1`) refuses it
   unless `PUBLIC_WEB_URL` gives the real address. A demonstration pack (`"placeholder": true`) may keep one.
3. **Write the content.** `site/content.fr.ts` is the source; English and Arabic translate the same shapes (a missing
   field does not compile). Replace the `site/messages.*.ts` texts, `archive.ts` (photos with their credits) and
   `index.ts`. Run `SCHOOL=<your-id> npm test -w @cdls/web`: `pack.spec.ts` checks that every photo, department and
   year the pages point at exists, in every language, and `i18n.spec.ts` that a translation keeps the facts of the
   French. The English and Arabic words the platform shares (sign-in, contact form) are in
   `apps/web/src/app/i18n/messages-base.<lang>.ts` and are machine-drafted: have a native speaker review them.
4. **Add the crest and the pictures.** Put the school's own crest in `public/crest.svg` as three symbols with the ids
   `crest`, `crest-on-dark` and `star-marker`, the favicon and icons next to it (and list them in
   `brand.icons`), and the photographs in `public/images/`. Use only files the school has the right to publish; the
   platform never fetches or redraws a logo.
5. **Set the environment** in `deploy/.env` (`deploy/scripts/generate-env` writes the secrets):
   `SCHOOL=<your-id>` and `SCHOOL_EMAIL_DOMAIN=<the school's mail domain>`, plus `PUBLIC_WEB_URL`, the SMTP details and
   the tunnel token or domain (docs/deployment.md). `SCHOOL` is read by the API when it starts and built into the web
   image, so the two must be built together. The API refuses to start on an unknown or invalid pack, and warns in
   production when `SCHOOL_EMAIL_DOMAIN` differs from the profile's `loginEmailDomain`.
6. **Build and check.** `SCHOOL=<your-id> npm run build`, then `SCHOOL=<your-id> npm run e2e:smoke -w @cdls/web`:
   every public page in every enabled language must open, have one `h1` and pass Axe at 390 and 1440 px.
7. **Deploy.** `docker compose -f deploy/compose.yaml --env-file deploy/.env --profile tunnel up -d --build`.
8. **Create the first administrator.**
   `docker compose -f deploy/compose.yaml exec api node dist/cli/create-admin.js --email <address> --first <first> --last <last>`.
   It also creates the two sections, named by the profile, and the subject catalogue.
9. **Create the year and the classes.** Sign in, then in the administration: the school year and its terms
   (the school-year and period screens), the classes of each section with the class each one leads to the next year (
   the next-year wizard follows that chain), the subjects of each class, the rooms. Levels and class codes are data of
   your database, not of the pack: a school with other levels just creates them.
10. **Import the people.** « Importer une liste » takes a CSV with the columns `nom`, `prénom` (and for students
    `section` (`nationale` or `bac`), `classe` and, optionally, `matricule` and `date de naissance`). Check the
    preview, then confirm.

## What the platform does not do

- **No real mailboxes.** Student and teacher logins are generated as `prenom.nom@<SCHOOL_EMAIL_DOMAIN>` (a number is
  added for homonyms). They are usernames: the platform creates no mailbox at that address.
- **Password-reset mail only reaches addresses the school's mail system already has.** « Mot de passe oublié » sends a link
  to the login address. If the school has no mailbox for it, the account can only be reset by the administration.
- **No shared installs.** Two schools never share a database or a deployment; to host several, run one stack per school.
- **The spaces are French only** (student, teacher, administration, e-mails, PDF report cards). Only the public site has
  other languages.

## Sections: what is configurable and what is not

Each school has two sections, `nationale` and `bac` in the code and the database, **named by the profile** in every
language (« Bac nationale », « Filière générale », ...). The names reach the public navigation and titles, the
administration, the report-card PDF and the section table of the database (`create-admin` and the seed write them).

The **codes** are still the two fixed values, and a profile that lists others is refused. Measured coupling (the union
`'nationale' | 'bac'`, `SECTION_IDS`): about 450 occurrences in 110 files. The part that carries the name was
contained, so it is done; the rest is not:

| Remaining work | Estimate |
|---|---|
| A string code validated against the profile instead of the union (`SectionId`, DTOs, `Subject.sections`, the roster import message) | 1 day |
| The public pages and addresses of the two tracks (`PublicPageId` `nationale`/`bac`, `SectionSlug`, the home and section pages) from a list | 2 days |
| The subject catalogue's `tracks` per school (a school's own subject-to-section mapping) | 1 day |
| 1 to 4 sections in the database, the admin screens that assume two (the section-change request names « l'autre filière ») | 1.5 days |
| Fixtures of the API e2e tests and Playwright specs (they spell the codes) | 1.5 days |

About 7 working days. Until then, a school with one section uses `bac` or `nationale` for it and names both in the
profile; a school with three or more cannot be set up.
