import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Account {
  readonly email: string;
  readonly password: string;
}

const FILE = resolve(__dirname, '../../api/demo-credentials.local.md');

/** Demo accounts written by `npm run db:seed` (local file, never committed). */
function load(): { admin: Account; teacher: Account; coordinator: Account; student: Account } {
  const text = readFileSync(FILE, 'utf8');
  const row = (label: string) => {
    // Table rows look like "| admin | admin@… | password |".
    const line = text.split(/\r?\n/).find((l) => l.startsWith(`| ${label}`));
    if (!line) throw new Error(`No "${label}" row in ${FILE}: run npm run db:seed`);
    const [, , email, password] = line.split('|').map((cell) => cell.trim());
    return { email, password };
  };
  const first = (heading: string) => {
    const section = text.split(`## ${heading}`)[1] ?? '';
    const email = section.match(/- (\S+@\S+)/)?.[1];
    if (!email) throw new Error(`No account under "${heading}" in ${FILE}`);
    return email;
  };
  /** The seed marks the teacher whose last name is Samir as coordinateur. */
  const coordinatorEmail = text.match(/- (\S*samir@\S+)/)?.[1];
  if (!coordinatorEmail) throw new Error(`No coordinator teacher in ${FILE}: run npm run db:seed`);
  return {
    admin: row('admin'),
    coordinator: { email: coordinatorEmail, password: row('teacher').password },
    teacher: { email: first('Teachers'), password: row('teacher').password },
    student: { email: first('Students'), password: row('student').password },
  };
}

export const ACCOUNTS = load();
