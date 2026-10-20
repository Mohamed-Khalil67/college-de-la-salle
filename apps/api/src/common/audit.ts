import type { Prisma } from '../generated/prisma/client.js';

export interface AuditEntry {
  readonly actorId: string | null;
  /** e.g. `grade.update` */
  readonly action: string;
  readonly entity: string;
  readonly entityId: string;
  readonly before?: Prisma.InputJsonValue;
  readonly after?: Prisma.InputJsonValue;
}

/** Writes audit rows inside the caller's transaction, so the change and its trace commit together. */
export function audit(tx: Prisma.TransactionClient, entries: readonly AuditEntry[]) {
  if (!entries.length) return Promise.resolve({ count: 0 });
  return tx.auditLog.createMany({ data: entries.map((e) => ({ ...e })) });
}
