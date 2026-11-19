import { BackgroundWork } from './background-work.js';

const later = <T>(ms: number, value: T, fail = false) =>
  new Promise<T>((resolve, reject) => setTimeout(() => (fail ? reject(new Error('x')) : resolve(value)), ms));

describe('BackgroundWork', () => {
  it('counts work while it runs and forgets it when it settles, even when it fails', async () => {
    const work = new BackgroundWork();
    const ok = work.track(later(5, 'a'));
    const bad = work.track(later(5, 'b', true));
    bad.catch(() => undefined);
    expect(work.pending).toBe(2);
    await expect(ok).resolves.toBe('a');
    await bad.catch(() => undefined);
    await later(1, null);
    expect(work.pending).toBe(0);
  });

  it('drain waits for work in progress and closes the door', async () => {
    const work = new BackgroundWork();
    let finished = false;
    void work.track(later(30, null).then(() => void (finished = true)));
    expect(work.closing).toBe(false);
    await expect(work.drain(1000)).resolves.toBe(true);
    expect(finished).toBe(true);
    expect(work.closing).toBe(true);
  });

  it('drain also waits for work that was started by work being drained', async () => {
    const work = new BackgroundWork();
    let second = false;
    void work.track(
      later(10, null).then(() => {
        void work.track(later(20, null).then(() => void (second = true)));
      }),
    );
    await expect(work.drain(1000)).resolves.toBe(true);
    expect(second).toBe(true);
  });

  it('drain gives up after the timeout and says so', async () => {
    const work = new BackgroundWork();
    void work.track(later(500, null));
    const started = Date.now();
    await expect(work.drain(40)).resolves.toBe(false);
    expect(Date.now() - started).toBeLessThan(400);
  });

  it('drain with nothing running returns at once', async () => {
    await expect(new BackgroundWork().drain(1000)).resolves.toBe(true);
  });
});
