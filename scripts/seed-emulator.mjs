// Seeds the local Firestore emulator's examiner directory (examiner_directory/{entry}).
//
//   npm run seed:emulator                       # default: every @example.test account is an examiner
//   npm run seed:emulator -- teacher@x.edu @school.edu
//
// Entries are exact emails or "@domain". Uses the emulator's "owner" bearer token, which bypasses
// security rules. Never targets production: the host is the local emulator only. For the
// super admin, use `npm run bootstrap:admin` (works against production too).
const host = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const project = process.env.GCLOUD_PROJECT ?? 'demo-exam-platform';
const entries = (process.argv.slice(2).length ? process.argv.slice(2) : ['@example.test']).map((e) =>
  e.trim().toLowerCase(),
);

for (const entry of entries) {
  const url = `http://${host}/v1/projects/${project}/databases/(default)/documents/examiner_directory/${encodeURIComponent(entry)}`;
  const fields = {
    entry: { stringValue: entry },
    kind: { stringValue: entry.startsWith('@') ? 'DOMAIN' : 'EMAIL' },
    role: { stringValue: 'examiner' },
    status: { stringValue: 'ACTIVE' },
    uid: { nullValue: null },
    updatedAt: { timestampValue: new Date().toISOString() },
    updatedBy: { stringValue: 'seed-emulator' },
  };
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) {
    console.error(`Seeding ${entry} failed (${response.status}): ${await response.text()}`);
    process.exit(1);
  }
}
console.log(`examiner_directory → ${entries.join(', ')} (project ${project}, ${host})`);
