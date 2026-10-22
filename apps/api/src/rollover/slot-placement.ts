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
 * (holidays removed), one conflict check against the index, one insert of the rows. Slots that clash with
 * the index (an existing session, event or room booking) are deleted again and reported, and the check runs
 * once more on the survivors; only when nothing clashes with the index are the slots that clash with each
 * other resolved (the sweep reports the earlier-starting one, the later one in the given order when they
 * start together, so a slot that only clashed with a dropped one is kept and the result never depends on
 * the order the database returns rows in).
 * Everything runs in the caller's transaction.
 */
export async function placeNewSlots(
  tx: Prisma.TransactionClient,
  occupancy: OccupancyService,
  slots: readonly NewSlot[],
): Promise<PlacedSlots> {
  if (!slots.length) return { placed: [], clashes: [] };
  await tx.timetableSlot.createMany({ data: [...slots] });
  const order = new Map(slots.map((s, i) => [s.id, i] as const));
  const at = (slotId: string | null) => (slotId ? (order.get(slotId) ?? -1) : -1);
  const clashes: { id: string; message: string }[] = [];
  let alive = new Set(slots.map((s) => s.id));
  // Latest slot first: of two slots that start together, the sweep reports (and we drop) the later one.
  let rows = (await occupancy.entriesForSlots(tx, [...alive])).sort((a, b) => at(b.slotId) - at(a.slotId));
  for (;;) {
    const found = await occupancy.detectBySlot(tx, rows);
    if (!found.size) break;
    const insideBatch = (c: { withSlotId: string | null }) => !!c.withSlotId && alive.has(c.withSlotId);
    const toIndex = [...found].filter(([, list]) => list.some((c) => !insideBatch(c)));
    const drop = new Map<string, string>();
    if (toIndex.length)
      for (const [id, list] of toIndex) drop.set(id, list.find((c) => !insideBatch(c))!.message);
    else for (const [id, list] of found) drop.set(id, list[0]!.message);
    for (const [id, message] of drop) clashes.push({ id, message });
    await tx.timetableSlot.deleteMany({ where: { id: { in: [...drop.keys()] } } });
    alive = new Set([...alive].filter((id) => !drop.has(id)));
    rows = rows.filter((r) => r.slotId && alive.has(r.slotId));
  }
  await occupancy.insert(tx, rows);
  clashes.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  return { placed: slots.map((s) => s.id).filter((id) => alive.has(id)), clashes };
}
