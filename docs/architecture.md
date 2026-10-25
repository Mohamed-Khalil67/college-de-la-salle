# CDLS: architecture, workflows and database schema

Diagrams are [Mermaid](https://mermaid.js.org/): GitHub draws them in the page, and they live in the repository as
text, so they change with the code. The schema diagrams follow `apps/api/prisma/schema.prisma` (the source of truth);
update them when a migration changes a table. Keys and the main columns are shown, not every column.

## 1. System

```mermaid
flowchart LR
  subgraph Clients
    V[Visitor]:::actor
    S[Student]:::actor
    T[Teacher]:::actor
    A[Admin and coordinator]:::actor
    CAL[Calendar app<br/>Google, Apple, Outlook]:::ext
  end

  subgraph Edge["Entry (docker compose profile)"]
    TUN[Cloudflare Tunnel]:::edge
    CADDY[Caddy + Let's Encrypt]:::edge
  end

  subgraph Stack["Docker stack (deploy/compose.yaml)"]
    WEB["web: nginx<br/>Angular 22 app<br/>public pages prerendered fr, en, ar"]:::svc
    API["api: NestJS 12<br/>JWT access token + rotating refresh cookie<br/>roles, ownership checks, audit"]:::svc
    DB[("PostgreSQL 18<br/>exclusion constraints<br/>nightly pg_dump")]:::db
    BK[backup job]:::svc
  end

  SHARED[["packages/shared<br/>API contract + pure logic<br/>calendar, timetable, targets, rollover"]]:::lib
  MAIL[SMTP server]:::ext

  V & S & T & A -->|HTTPS| TUN
  V & S & T & A -->|HTTPS| CADDY
  CAL -->|secret .ics link| TUN
  TUN --> WEB
  CADDY --> WEB
  WEB -->|"/api"| API
  API --> DB
  BK --> DB
  API -->|"password reset, optional alerts"| MAIL
  SHARED -.types and rules.-> WEB
  SHARED -.types and rules.-> API

  classDef actor fill:#e8eef7,stroke:#1b2a49,color:#1b2a49
  classDef svc fill:#fff,stroke:#1b2a49,color:#1b2a49
  classDef db fill:#f5ecd2,stroke:#9a7b2f,color:#1b2a49
  classDef edge fill:#eef3ee,stroke:#3d6b4f,color:#1b2a49
  classDef ext fill:#f3f3f3,stroke:#888,color:#333
  classDef lib fill:#fdf6e3,stroke:#9a7b2f,color:#1b2a49
```

## 2. Who can do what

```mermaid
flowchart TB
  L[Sign in] --> P{First sign-in or<br/>temporary password?}
  P -->|yes| CP[Choose a password<br/>and confirm section and class]
  P -->|no| R{Role}
  CP --> R
  F[Forgotten password] --> FM[E-mail with single-use link] --> CP

  R -->|student| SS["Student space<br/>timetable, homework, grades,<br/>absences, report cards,<br/>announcements, notifications,<br/>calendar feed"]
  R -->|teacher| TS["Teacher space<br/>own timetable, agenda,<br/>grade entry and publishing,<br/>attendance, groups and Assigner à,<br/>announcements"]
  R -->|"teacher flagged coordinator"| CS["Teacher space plus year structure:<br/>subjects, coefficients, rooms,<br/>periods, calendar days, timetable series"]
  R -->|admin| AS["Administration<br/>users and roster import, classes,<br/>school years, validations,<br/>report cards, messages,<br/>next-year rollover"]

  SS -.reads only own data.-> AC[AccessService<br/>ownership checks on every route]
  TS -.writes only classes they teach.-> AC
  CS --> AC
  AS --> AC
```

## 3. A school year, end to end

```mermaid
flowchart LR
  A1[Admin creates the year<br/>sections, classes, subjects<br/>with coefficients, rooms] --> A2[Periods per section<br/>holidays and closed days]
  A2 --> A3[Roster import<br/>name based e-mails,<br/>homonyms numbered]
  A3 --> A4[Timetable<br/>weekly slots, groups,<br/>hard conflicts blocked,<br/>soft warnings with reason]
  A4 --> D[Daily life]

  subgraph D2["Daily life"]
    direction TB
    T1[Teacher takes attendance<br/>from the session] --> T2[Teacher creates homework<br/>or an exam, Assigner à<br/>class, group or students]
    T2 --> T3[Grades entered, then published]
    T3 --> T4[Student sees them,<br/>notified, calendar updates]
  end
  D --> D2
  D2 --> E[Period closes<br/>coefficients frozen]
  E --> F[Report cards generated,<br/>edited, published as PDF]
  F --> G[Rollover preview<br/>writes nothing]
  G --> H[Apply in one transaction:<br/>new year, promotions,<br/>groups copied,<br/>old year archived read-only]
  H --> A2
```

## 4. A change to the timetable

```mermaid
sequenceDiagram
  actor U as Teacher or admin
  participant W as Web app
  participant API as NestJS API
  participant DB as PostgreSQL

  U->>W: move a session, change a room, edit a series
  W->>API: POST /timetable/check (same pipeline, rolled back)
  API->>DB: rebuild occupancy rows in a transaction, then roll back
  API-->>W: conflicts, soft warnings, free rooms and nearby free slots
  U->>W: pick a suggestion or give a reason for a warning
  W->>API: write
  API->>DB: one transaction: save slot or exception, rebuild occupancy
  Note over DB: exclusion constraints refuse two sessions<br/>for the same room, teacher or class
  alt clash
    DB-->>API: constraint error
    API-->>W: 409 TIMETABLE_CONFLICT with suggestions
  else saved
    API->>DB: notifications for concerned students and teachers, audit row
    API-->>W: 200
    Note over API,DB: the personal .ics feed shows the new time at the next refresh
  end
```

## 5. Database schema

The 13 enums are not drawn: `Role`, `RoomKind`, `PeriodKind`, `CalendarDayType`, `UserStatus`, `SectionChangeStatus`,
`TargetScope`, `AttendanceStatus`, `WeekParity`, `SlotExceptionKind`, `OccupancySource`, `NotificationKind` and
`NotificationMailState`.

### 5.1 People, school years, classes

```mermaid
erDiagram
  USER ||--o| STUDENT : "is a"
  USER ||--o| TEACHER : "is a"
  USER ||--o{ REFRESH_TOKEN : "sessions"
  USER ||--o{ PASSWORD_RESET_TOKEN : "reset links"
  USER ||--o{ CALENDAR_FEED : "secret feed link"
  USER ||--o{ NOTIFICATION : "receives"
  SECTION |o--o{ STUDENT : "current section"
  SCHOOL_YEAR ||--o{ SCHOOL_CLASS : "has"
  SECTION ||--o{ SCHOOL_CLASS : "has"
  SCHOOL_CLASS |o--o| SCHOOL_CLASS : "next class (rollover)"
  STUDENT ||--o{ ENROLLMENT : "enrolled"
  SCHOOL_CLASS ||--o{ ENROLLMENT : "roster"
  SCHOOL_YEAR ||--o{ ENROLLMENT : "per year"
  SCHOOL_CLASS ||--o{ CLASS_SUBJECT : "teaches"
  SUBJECT ||--o{ CLASS_SUBJECT : "coefficient lives here"
  TEACHER ||--o{ TEACHING_ASSIGNMENT : "assigned"
  CLASS_SUBJECT ||--o{ TEACHING_ASSIGNMENT : "taught by"
  SCHOOL_YEAR ||--o{ PERIOD : "terms"
  SECTION |o--o{ PERIOD : "per section"
  SCHOOL_YEAR ||--o{ CALENDAR_DAY : "holidays, closed days"
  SECTION |o--o{ CALENDAR_DAY : "scope"
  CALENDAR_DAY ||--o{ CALENDAR_DAY_CLASS : "scope"
  SCHOOL_CLASS ||--o{ CALENDAR_DAY_CLASS : "scope"
  STUDENT ||--o{ SECTION_CHANGE_REQUEST : "asks"
  SECTION ||--o{ SECTION_CHANGE_REQUEST : "from and to"
  USER ||--o{ SECTION_CHANGE_REQUEST : "requested and decided by"
  SCHOOL_CLASS |o--o{ SECTION_CHANGE_REQUEST : "new class"

  USER {
    uuid id PK
    string email UK
    enum role
    enum status
    bool mustChangePassword
    datetime temporaryPasswordExpiresAt
  }
  STUDENT {
    uuid id PK
    uuid userId FK
    uuid sectionId FK
    date graduatedOn
  }
  TEACHER {
    uuid id PK
    uuid userId FK
    bool isCoordinator
  }
  SCHOOL_YEAR {
    uuid id PK
    date startsOn
    date endsOn
    datetime archivedAt
  }
  SECTION {
    uuid id PK
    string code UK
  }
  SCHOOL_CLASS {
    uuid id PK
    uuid schoolYearId FK
    uuid sectionId FK
    uuid nextClassId FK
  }
  ENROLLMENT {
    uuid id PK
    uuid studentId FK
    uuid classId FK
    uuid schoolYearId FK
    date leftOn
  }
  SUBJECT {
    uuid id PK
    string name
  }
  CLASS_SUBJECT {
    uuid id PK
    uuid classId FK
    uuid subjectId FK
    decimal coefficient
  }
  PERIOD {
    uuid id PK
    uuid schoolYearId FK
    uuid sectionId FK
    enum kind
  }
  SECTION_CHANGE_REQUEST {
    uuid id PK
    uuid studentId FK
    enum status
  }
```

### 5.2 Timetable, groups, rooms

```mermaid
erDiagram
  ROOM ||--o{ TIMETABLE_SLOT : "hosts"
  TEACHER ||--o{ TIMETABLE_SLOT : "teaches"
  CLASS_SUBJECT ||--o{ TIMETABLE_SLOT : "weekly rule"
  ACTIVITY_TYPE ||--o{ TIMETABLE_SLOT : "cours, TD, TP, custom"
  TEACHER |o--o{ ACTIVITY_TYPE : "private custom types"
  GROUP |o--o{ TIMETABLE_SLOT : "for a group"
  SCHOOL_CLASS ||--o{ GROUP : "split into"
  GROUP ||--o{ GROUP_MEMBER : "members"
  STUDENT ||--o{ GROUP_MEMBER : "belongs"
  TIMETABLE_SLOT ||--o{ SLOT_EXCEPTION : "cancel, move, room"
  ROOM |o--o{ SLOT_EXCEPTION : "new room"
  TIMETABLE_SLOT |o--o{ OCCUPANCY : "index rows"
  SLOT_EXCEPTION |o--o{ OCCUPANCY : "index rows"
  EVENT |o--o{ OCCUPANCY : "one-off holds"

  TIMETABLE_SLOT {
    uuid id PK
    uuid classSubjectId FK
    uuid groupId FK
    uuid teacherId FK
    uuid roomId FK
    uuid activityTypeId FK
    int weekday
    enum weekParity
  }
  SLOT_EXCEPTION {
    uuid id PK
    uuid slotId FK
    date date
    enum kind
  }
  OCCUPANCY {
    uuid id PK
    uuid roomId
    uuid teacherId
    uuid classId
    string divisionKey
    tstzrange during "btree_gist EXCLUDE per room, teacher, class, group"
  }
  ACTIVITY_TYPE {
    uuid id PK
    string code
    bool gradable
    bool repeatable
    bool homework
    uuid ownerTeacherId FK
  }
  GROUP {
    uuid id PK
    uuid classId FK
    string division
  }
```

### 5.3 Work, grades, attendance, communication

```mermaid
erDiagram
  ACTIVITY_TYPE ||--o{ EVENT : "kind"
  PERIOD |o--o{ EVENT : "grades follow the period"
  SUBJECT |o--o{ EVENT : "about"
  SCHOOL_CLASS |o--o{ EVENT : "for a class"
  SECTION |o--o{ EVENT : "for a section"
  ROOM |o--o{ EVENT : "in"
  TEACHER ||--o{ EVENT : "author"
  EVENT ||--o{ ASSESSMENT_TARGET : "Assigner à"
  GROUP |o--o{ ASSESSMENT_TARGET : "a group"
  STUDENT |o--o{ ASSESSMENT_TARGET : "or a student"
  EVENT ||--o{ GRADE : "marks"
  STUDENT ||--o{ GRADE : "receives"
  TEACHER ||--o{ GRADE : "graded by"
  EVENT ||--o{ HOMEWORK_COMPLETION : "done"
  STUDENT ||--o{ HOMEWORK_COMPLETION : "ticks"
  EVENT ||--o{ ATTENDANCE : "session roll"
  STUDENT ||--o{ ATTENDANCE : "present or absent"
  STUDENT ||--o{ REPORT_CARD : "has"
  PERIOD ||--o{ REPORT_CARD : "per period"
  SCHOOL_CLASS ||--o{ REPORT_CARD : "of class"
  USER ||--o{ POST : "writes"
  SCHOOL_CLASS |o--o{ POST : "audience"
  SECTION |o--o{ POST : "audience"
  USER |o--o{ AUDIT_LOG : "actor"
  USER |o--o{ CONTACT_MESSAGE : "handled by"

  EVENT {
    uuid id PK
    uuid activityTypeId FK
    uuid periodId FK
    uuid classId FK
    uuid authorId FK
    date date
  }
  GRADE {
    uuid id PK
    uuid eventId FK
    uuid studentId FK
    decimal score
    bool published
  }
  ATTENDANCE {
    uuid id PK
    uuid eventId FK
    uuid studentId FK
    date date
    enum status
  }
  REPORT_CARD {
    uuid id PK
    uuid studentId FK
    uuid periodId FK
    datetime publishedAt
  }
  ASSESSMENT_TARGET {
    uuid id PK
    uuid eventId FK
    uuid groupId FK
    uuid studentId FK
  }
  AUDIT_LOG {
    uuid id PK
    uuid actorId FK
    string action
    string entityId
  }
  CONTACT_MESSAGE {
    uuid id PK
    string email
    datetime handledAt
  }
```

## 6. Where things live

| What | Where |
|---|---|
| REST contract and pure logic | `packages/shared/src/` |
| API modules, guards, services | `apps/api/src/` (one folder per feature), conventions in `apps/api/CLAUDE.md` |
| Schema and migrations | `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/` |
| Web app and design system | `apps/web/src/app/`, conventions in `apps/web/CLAUDE.md`, tokens in `apps/web/src/styles/` |
| Deployment | `deploy/`, `docs/deployment.md` |
| Design decisions and leftovers | `docs/school-year-design.md` |
