import { ConflictException } from '@nestjs/common';
import { conflictOnReference, isForeignKeyViolation, isTransientConflict } from './errors.js';

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

describe('isTransientConflict', () => {
  it('recognises P2034, the pg codes 40001/40P01 and the adapter kind, at any level', () => {
    expect(isTransientConflict({ code: 'P2034' })).toBe(true);
    expect(isTransientConflict({ code: '40P01' })).toBe(true);
    expect(isTransientConflict({ code: 'P2010', meta: { driverAdapterError: { cause: { originalCode: '40001' } } } })).toBe(true);
    expect(isTransientConflict({ cause: { cause: { kind: 'TransactionWriteConflict' } } })).toBe(true);
  });

  it('ignores everything else, and does not loop on a cyclic cause', () => {
    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;
    for (const e of [null, 'x', { code: 'P2002' }, { code: '23P01' }, new Error('Code: `40P01`'), cyclic])
      expect(isTransientConflict(e)).toBe(false);
  });
});
