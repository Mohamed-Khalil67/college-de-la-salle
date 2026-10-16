// Seeds the local Firestore emulator with the examiner allow-list (config/examiners).
//
//   npm run seed:emulator                      # default: every @example.test account is an examiner
//   npm run seed:emulator -- teacher@x.edu @school.edu
//
// Uses the emulator's "owner" bearer token, which bypasses security rules. Never targets
// production: the host is the local emulator only.
const host = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const project = process.env.GCLOUD_PROJECT ?? 'demo-exam-platform';
const entries = process.argv.slice(2).length ? process.argv.slice(2) : ['@example.test'];

const url = `http://${host}/v1/projects/${project}/databases/(default)/documents/config/examiners`;
const body = {
  fields: { emails: { arrayValue: { values: entries.map((e) => ({ stringValue: e.toLowerCase() })) } } },
};

const response = await fetch(url, {
  method: 'PATCH',
  headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
if (!response.ok) {
  console.error(`Seeding failed (${response.status}): ${await response.text()}`);
  process.exit(1);
}
console.log(`config/examiners → ${entries.join(', ')} (project ${project}, ${host})`);
