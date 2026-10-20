# CDLS — Product brainstorm

Versioned copy of the FigJam board: https://www.figma.com/board/OQ518A0iBOWrry0cahLyfC

Scope: one school (Collège de la Salle, Daher). Roles: admin/staff, teacher, student. Not in scope yet: parent space, Docker/deployment.

## 1. Roles and feature map

```mermaid
flowchart LR
  P["CDLS Platform"] --> A["Admin / Staff"]
  P --> T["Teacher"]
  P --> S["Student"]
  P --> V["Public visitor"]
  A --> A1["School years and terms"]
  A --> A2["Sections and classes (nationale, bac français)"]
  A --> A3["Accounts: teachers and students, CSV import"]
  A --> A4["Teaching assignments (teacher × class × subject)"]
  A --> A5["Publish term report cards"]
  T --> T1["My classes and timetable"]
  T --> T2["Calendar: courses, homework, exams"]
  T --> T3["Grade entry grid and publishing"]
  T --> T4["Attendance sheet"]
  T --> T5["Announcements to a class or section"]
  S --> S1["Dashboard: today, homework due, latest grades"]
  S --> S2["Timetable and calendar"]
  S --> S3["Homework with done tracking"]
  S --> S4["Grades and averages by subject"]
  S --> S5["Absences"]
  S --> S6["Report card PDF"]
  V --> V1["Home, history, tracks, news, contact"]
  V --> V2["Login"]
```

## 2. Key user flows

```mermaid
flowchart LR
  L["Login"] --> R{"Role?"}
  R -->|admin| AD["Admin panel"]
  R -->|teacher| TS["Teacher space"]
  R -->|student| SS["Student space"]
  TS --> E["Create exam in calendar"] --> G["Enter grades"] --> D{"Publish?"}
  D -->|not yet| DR["Draft, hidden from students"]
  D -->|yes| PB["Published"] --> SS2["Student sees grade and new average"]
  TS --> AT["Attendance sheet"] --> AB["Mark absent / late"] --> SS3["Student sees absence"]
  AD --> TR["Close term"] --> RC["Generate report cards"] --> RP["Publish"] --> SS4["Student downloads PDF"]
```

## 3. Sitemap

| Public | Student `/eleve` | Teacher `/enseignant` | Admin `/admin` |
|---|---|---|---|
| Accueil, Histoire, Bac nationale, Bac français, Actualités, Contact, Connexion | Tableau de bord, Emploi du temps, Devoirs, Notes, Absences, Bulletins | Mes classes, Agenda, Saisie des notes, Appel, Annonces | Années et trimestres, Classes, Utilisateurs + import CSV, Affectations, Bulletins |

## 4. Data model (PostgreSQL)

```mermaid
erDiagram
  USER ||--o| STUDENT : is
  USER ||--o| TEACHER : is
  SCHOOL_YEAR ||--|{ TERM : has
  SECTION ||--|{ SCHOOL_CLASS : has
  SCHOOL_YEAR ||--|{ SCHOOL_CLASS : runs
  SCHOOL_CLASS ||--o{ ENROLLMENT : has
  STUDENT ||--o{ ENROLLMENT : in
  TEACHER ||--o{ TEACHING_ASSIGNMENT : teaches
  SCHOOL_CLASS ||--o{ TEACHING_ASSIGNMENT : taught_in
  SUBJECT ||--o{ TEACHING_ASSIGNMENT : for
  SCHOOL_CLASS ||--o{ EVENT : targets
  SUBJECT ||--o{ EVENT : about
  TEACHER ||--o{ EVENT : authors
  EVENT ||--o{ GRADE : graded_by
  STUDENT ||--o{ GRADE : receives
  EVENT ||--o{ HOMEWORK_COMPLETION : done
  STUDENT ||--o{ HOMEWORK_COMPLETION : marks
  STUDENT ||--o{ ATTENDANCE : has
  EVENT ||--o{ ATTENDANCE : taken_at
  STUDENT ||--o{ REPORT_CARD : gets
  TERM ||--o{ REPORT_CARD : for
  USER ||--o{ POST : writes
  USER ||--o{ AUDIT_LOG : acts
```

Mapping from today's Firestore code: `Grade` and `averageOnTwenty` ([space.model.ts](../src/app/space/space.model.ts)) → `GRADE`; `CalendarEvent` and `EventKind` ([calendar.model.ts](../src/app/space/calendar.model.ts)) → `EVENT`; `students.done[]` → `HOMEWORK_COMPLETION`; `firestore.rules` → the API's role guards.

## 5. Architecture and agent lanes

```mermaid
flowchart LR
  BR["Browser"] --> WEB["apps/web: Angular 22"]
  WEB -->|REST /api| API["apps/api: NestJS + Prisma"]
  API --> DB[("PostgreSQL 17, local")]
  WEB -.-> SH["packages/shared"]
  API -.-> SH
```

| Lane | Owns | Starts when |
|---|---|---|
| Lead (main session) | plan, contracts in `packages/shared`, merges | now |
| A: Design | brand research, Figma design system and screens | board signed off |
| B: Backend | `apps/api/**` | monorepo scaffold merged |
| C: Public site | `apps/web/.../public/**`, `ui/**` | design tokens ready |
| D/E: Spaces | student, teacher, admin folders | UI components merged |

At most 3 lanes at once. Every PR gets `/code-review`. Corrections go into `CLAUDE.md` or `.claude/skills/` so later agents follow them.

## 6. Roadmap

1. Board sign-off + skills setup
2. Lane A: brand → design system → screens · Lane B in parallel: scaffold → Prisma schema + seed → auth → feature modules
3. Lanes C/D/E: UI components → public site → student, teacher, admin spaces
4. Axe audit + Playwright e2e
