/**
 * Adds a teacher to the allow-list of the LOCAL Firebase emulator (`npm run emulators` must be running).
 *
 *   node scripts/add-teacher.mjs marc.dupont@example.org "Marc Dupont"
 *
 * In production nobody runs this: the school's administrator adds a document to the `teachers`
 * collection in the Firebase console, with the teacher's e-mail (in lower case) as the document id.
 */
const [email, name = ''] = process.argv.slice(2);
if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/add-teacher.mjs <email> [name]');
  process.exit(1);
}

const host = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const project = process.env.FIREBASE_PROJECT ?? 'demo-lasalle';
const id = email.trim().toLowerCase();
const url = `http://${host}/v1/projects/${project}/databases/(default)/documents/teachers/${encodeURIComponent(id)}`;

// "Bearer owner" is the emulator's admin token: it bypasses the security rules, which forbid client writes.
const res = await fetch(url, {
  method: 'PATCH',
  headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { name: { stringValue: name } } }),
});

if (!res.ok) {
  console.error(`Failed (${res.status}): ${await res.text()}`);
  process.exit(1);
}
console.log(`Teacher added: ${id}`);
