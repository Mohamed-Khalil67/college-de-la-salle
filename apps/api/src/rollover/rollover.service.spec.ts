import { ConflictException } from '@nestjs/common';
import { GroupsRolloverStep, ROLLOVER_EXTRA_STEPS } from './rollover-step.js';
import { RolloverModule } from './rollover.module.js';

describe('rollover hook for the groups of phase 3', () => {
  it('registers a no-op groups step that reports nothing done', async () => {
    const step = new GroupsRolloverStep();
    expect(step.id).toBe('groups');
    await expect(step.apply()).resolves.toEqual({ create: 0, existing: 0, skipped: 0 });
  });

  it('exposes the extra steps through one injection token', () => {
    const providers = Reflect.getMetadata('providers', RolloverModule) as { provide?: unknown }[];
    expect(providers.some((p) => p.provide === ROLLOVER_EXTRA_STEPS)).toBe(true);
  });

  // Pending until phase 3 (apps/api/src/groups) has merged: plug its step into ROLLOVER_EXTRA_STEPS
  // (see the comment in rollover-step.ts), then write this test in rollover.e2e-spec.ts against two groups
  // of a class: the copy creates the groups and their members once, and a second run creates nothing.
  it.todo('copies the groups of every class and their members into the new year, once (phase 3)');
});

describe('the stale-preview refusal', () => {
  it('is a 409 whose code the web app can read', () => {
    const error = new ConflictException({ statusCode: 409, code: 'ROLLOVER_PREVIEW_STALE' });
    expect(error.getResponse()).toMatchObject({ code: 'ROLLOVER_PREVIEW_STALE' });
  });
});
