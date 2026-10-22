import { ConflictException } from '@nestjs/common';
import type { AuthUser } from '../common/auth-user.js';
import type { OccupancyService } from '../occupancy/occupancy.service.js';
import { GroupsRolloverStep } from './groups-rollover-step.js';
import { ROLLOVER_EXTRA_STEPS, type RolloverContext } from './rollover-step.js';
import { RolloverModule } from './rollover.module.js';

const actor = { id: 'admin', role: 'admin' } as AuthUser;
const context = (over: Partial<RolloverContext> = {}): RolloverContext => ({
  sourceYearId: 'sy',
  targetYearId: 'ty',
  classMap: new Map([
    ['s-2nde', 't-2nde'],
    ['s-1ere', 't-1ere'],
  ]),
  placements: new Map(),
  actor,
  copyTimetable: false,
  years: { sourceEndsOn: '2027-06-30', targetStartsOn: '2027-09-01', targetEndsOn: '2028-06-30' },
  ...over,
});

/** A transaction double: the tables the groups step reads, and the writes it makes. */
function fakeTx(data: {
  sourceGroups?: object[];
  targetGroups?: object[];
  open?: object[];
  enrolments?: object[];
  openInTarget?: object[];
}) {
  const created = { groups: [] as object[], members: [] as object[] };
  const groupRows = [...(data.sourceGroups ?? []), ...(data.targetGroups ?? [])];
  return {
    created,
    tx: {
      group: {
        findMany: vi.fn(async ({ where }: { where: { classId: { in: string[] } } }) =>
          [...groupRows, ...created.groups].filter((g) => where.classId.in.includes((g as { classId: string }).classId)),
        ),
        createMany: vi.fn(async ({ data: rows }: { data: object[] }) => {
          created.groups.push(...rows.map((r, i) => ({ id: `new-${created.groups.length + i}`, ...r })));
        }),
      },
      groupMember: {
        findMany: vi.fn(async ({ where }: { where: { classId: { in: string[] } } }) =>
          where.classId.in.includes('t-1ere') ? (data.openInTarget ?? []) : (data.open ?? []),
        ),
        createMany: vi.fn(async ({ data: rows }: { data: object[] }) => {
          created.members.push(...rows);
        }),
      },
      enrollment: { findMany: vi.fn(async () => data.enrolments ?? []) },
      auditLog: { createMany: vi.fn(), create: vi.fn() },
    },
  };
}

describe('GroupsRolloverStep (the groups hook of phase 5)', () => {
  const step = new GroupsRolloverStep({} as OccupancyService);

  const world = {
    sourceGroups: [
      { id: 'g-lv2-2nde', classId: 's-2nde', division: 'LV2', label: 'Allemand' },
      { id: 'g-lv2-1ere', classId: 's-1ere', division: 'LV2', label: 'Allemand' },
    ],
    open: [
      { studentId: 'promoted', classId: 's-2nde', division: 'LV2', group: { label: 'Allemand' } },
      { studentId: 'repeater', classId: 's-2nde', division: 'LV2', group: { label: 'Allemand' } },
    ],
    enrolments: [
      { studentId: 'promoted', classId: 't-1ere', enrolledOn: new Date('2027-09-01T00:00:00Z') },
      { studentId: 'repeater', classId: 't-2nde', enrolledOn: new Date('2027-09-01T00:00:00Z') },
    ],
  };

  it('is registered through the extra-steps token', () => {
    const providers = Reflect.getMetadata('providers', RolloverModule) as { provide?: unknown }[];
    expect(providers.some((p) => p.provide === ROLLOVER_EXTRA_STEPS)).toBe(true);
  });

  it('copies each group onto the copied class and the memberships of the promoted students only', async () => {
    const { tx, created } = fakeTx(world);
    const result = await step.apply(tx as never, context());
    expect(created.groups).toMatchObject([
      { classId: 't-2nde', division: 'LV2', label: 'Allemand' },
      { classId: 't-1ere', division: 'LV2', label: 'Allemand' },
    ]);
    // `promoted` joins the new première's group, the repeater (same level) and others get nothing.
    expect(created.members).toHaveLength(1);
    expect(created.members[0]).toMatchObject({ studentId: 'promoted', classId: 't-1ere', division: 'LV2' });
    expect(result.steps).toEqual([
      { id: 'groups', label: expect.any(String), create: 2, existing: 0, skipped: 0 },
      { id: 'group_members', label: expect.any(String), create: 1, existing: 0, skipped: 1 },
      { id: 'group_slots', label: expect.any(String), create: 0, existing: 0, skipped: 0 },
    ]);
  });

  it('changes nothing the second time', async () => {
    const targetGroups = [
      { id: 'n1', classId: 't-2nde', division: 'LV2', label: 'Allemand' },
      { id: 'n2', classId: 't-1ere', division: 'LV2', label: 'Allemand' },
    ];
    const { tx, created } = fakeTx({
      ...world,
      targetGroups,
      openInTarget: [{ studentId: 'promoted', classId: 't-1ere', division: 'LV2' }],
    });
    const result = await step.apply(tx as never, context());
    expect(created.groups).toEqual([]);
    expect(created.members).toEqual([]);
    expect(result.steps.map((s) => s.create)).toEqual([0, 0, 0]);
    expect(result.steps[1]).toMatchObject({ existing: 1 });
    expect(tx.auditLog.createMany).not.toHaveBeenCalled();
  });
});

describe('the stale-preview refusal', () => {
  it('is a 409 whose code the web app can read', () => {
    const error = new ConflictException({ statusCode: 409, code: 'ROLLOVER_PREVIEW_STALE' });
    expect(error.getResponse()).toMatchObject({ code: 'ROLLOVER_PREVIEW_STALE' });
  });
});
