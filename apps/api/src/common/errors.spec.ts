import { ConflictException } from '@nestjs/common';
import { conflictOnReference, isForeignKeyViolation } from './errors.js';

describe('conflictOnReference', () => {
  it('turns a foreign-key violation into a 409 with the given message', async () => {
    const violation = Object.assign(new Error('fk'), { code: 'P2003' });
    expect(isForeignKeyViolation(violation)).toBe(true);
    const error = await conflictOnReference(Promise.reject(violation), 'Encore utilisé.').catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toBe('Encore utilisé.');
  });

  it('passes results and other errors through', async () => {
    await expect(conflictOnReference(Promise.resolve(3), 'x')).resolves.toBe(3);
    const other = Object.assign(new Error('unique'), { code: 'P2002' });
    expect(isForeignKeyViolation(other)).toBe(false);
    await expect(conflictOnReference(Promise.reject(other), 'x')).rejects.toBe(other);
  });
});
