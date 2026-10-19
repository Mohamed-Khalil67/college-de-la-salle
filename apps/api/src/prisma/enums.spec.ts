import { EVENT_KINDS } from '@cdls/shared';
import { EventKind } from '../generated/prisma/enums.js';

describe('Prisma enums', () => {
  it('EventKind matches the shared calendar model', () => {
    expect(Object.values(EventKind)).toEqual(EVENT_KINDS.map((k) => k.id));
  });
});
