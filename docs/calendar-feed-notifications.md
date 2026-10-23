# Calendar feed and notifications

Two gaps found by comparing the platform with university timetable tools (ADE agenda export): no calendar a
student or teacher could subscribe to, and no word when a session is cancelled or moved.

## « Synchroniser mon agenda »

- A student or teacher creates **one secret link** (`/eleve/synchroniser`, `/enseignant/synchroniser`) and pastes it into
  Google Agenda, Apple Calendrier or Outlook. The page explains each, can regenerate the link and revokes it.
- The link is `…/api/calendar/feed/<token>.ics`. It is public (calendar apps cannot sign in): the token is the credential.
  32 hex digits identify the feed, 43 random base64url characters are the secret; **only an HMAC of the secret is
  stored**, compared in constant time. Making a new link replaces the old one; revoking deletes it.
- It stops working, with the same 404 as any wrong token, when the link is revoked or replaced, when the password is
  changed or reset, and when the account is disabled, restored or archived (the link remembers the password version
  it was made with). Archived years are never in a feed: only the current year's class and slots.
- Content, for a rolling window (30 days back, 180 ahead): the user's real sessions with exceptions applied
  (cancelled sessions leave, moved ones appear at the new day, time and room), one-off events, exams and homework that
  concern them (the same audience rules as the API: class, groups, « Assigner à »), and the school's calendar days
  (holidays, no classes, exam weeks) for their section and class. A student never gets another class's entries.
- Calendar apps update instead of duplicating: each entry keeps its UID (`slot-<slot>-<original day>`,
  `event-<id>`, `day-<id>`) and a SEQUENCE that grows when the entry changes. Times are in `Africa/Cairo` with a
  VTIMEZONE block. Google refreshes imported links every few hours: the page says so.

## Notifications

- A `notifications` row per concerned user, written **in the transaction of the change**: a session cancelled, moved,
  re-roomed or restored (timetable exception), an event moved, re-roomed or cancelled, a homework assigned, grades
  published. Students are notified for their class (whole-class sessions, their groups' sessions, the work assigned to
  them); the teacher of the session and the author of an event are told too, unless they made the change.
- A bell in the app bar of the student and teacher spaces (link named « Notifications, N non lues », count announced
  politely), a list page with « Marquer comme lue », « Tout marquer comme lu » and a filter, all keyboard operable.
- E-mail is **opt-in** (off by default): one grouped message every `NOTIFICATION_MAIL_INTERVAL_MINUTES`, through the
  existing `MailService`, in French; never for a session already past, an already read notification, or one older
  than a day. Notifications are deleted after `NOTIFICATION_RETENTION_DAYS`.

## Left for later

- A substitute teacher named by the administration is not announced (the substitution only changes the teacher).
- Notifications for series-wide timetable edits (« toute la série »): only single-session changes announce themselves.
- Weekly legacy events are not announced session by session.
- Push notifications (browser or phone).
