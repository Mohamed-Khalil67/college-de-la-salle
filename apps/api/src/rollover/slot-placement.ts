import type { Prisma } from '../generated/prisma/client.js';
import { OccupancyService } from '../occupancy/occupancy.service.js';

/** A new slot to write: its id is chosen by the caller so the result can name it. */
export type NewSlot = Prisma.TimetableSlotCreateManyInput & { readonly id: string };

export interface PlacedSlots {
  /** Slots written and indexed, in the order given. */
  readonly placed: readonly string[];
  /** Slots left out because they clash with the index or with another new slot, with the reason. */
  readonly clashes: readonly { readonly id: string; readonly message: string }[];
}

/**
 * Writes new timetable slots and their occupancy rows with a handful of queries, whatever their number (the
 * old copy ran about four queries per slot): one insert for the slots, one expansion of their sessions
 * (holidays removed), one conflict check against the index, one insert of the rows. A slot that clashes is
 * deleted again and reported; the check then runs once more on the survivors (a slot that only clashed with
 * a dropped one is kept), until none clashes. Everything runs in the caller's transaction.
 */
export async function placeNewSlots(
  tx: Prisma.TransactionClient,
  occupancy: OccupancyService,
  slots: readonly NewSlot[],
): Promise<PlacedSlots> {
  if (!slots.length) return { placed: [], clashes: [] };
  await tx.timetableSlot.createMany({ data: [...slots] });
  const clashes: { id: string; message: string }[] = [];
  let alive = slots.map((s) => s.id);
  let rows = await occupancy.entriesForSlots(tx, alive);
  for (;;) {
    const found = await occupancy.detectBySlot(tx, rows);
    if (!found.size) break;
    for (const [id, conflict] of found) clashes.push({ id, message: conflict.message });
    await tx.timetableSlot.deleteMany({ where: { id: { in: [...found.keys()] } } });
    alive = alive.filter((id) => !found.has(id));
    rows = rows.filter((r) => r.slotId && !found.has(r.slotId));
  }
  await occupancy.insert(tx, rows);
  const order = new Map(slots.map((s, i) => [s.id, i] as const));
  clashes.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  return { placed: alive, clashes };
}
