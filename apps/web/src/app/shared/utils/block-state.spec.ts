import { describe, expect, it } from 'vitest';
import { blockState, bothOf, LOADING, pageStatusMessage, type Snapshot } from './block-state';

const nonEmpty = (list: readonly number[]) => (list.length ? list : null);

describe('blockState', () => {
  it('is loading until the value arrives', () => {
    expect(blockState(LOADING, nonEmpty)).toEqual({ status: 'loading' });
  });
  it('reports the error, even when an older value is still there', () => {
    const error = new Error('boom');
    expect(blockState({ error, value: [1] }, nonEmpty)).toEqual({ status: 'error', error });
  });
  it('is empty when the view finds nothing to show', () => {
    expect(blockState({ error: undefined, value: [] }, nonEmpty)).toEqual({ status: 'empty' });
  });
  it('is ready with the view of the value', () => {
    expect(blockState({ error: undefined, value: [1, 2] }, nonEmpty)).toEqual({ status: 'ready', data: [1, 2] });
  });
});

describe('bothOf', () => {
  const a: Snapshot<number> = { error: undefined, value: 1 };
  const b: Snapshot<string> = { error: undefined, value: 'x' };
  it('pairs two values', () => {
    expect(bothOf(a, b)).toEqual({ error: undefined, value: [1, 'x'] });
  });
  it('waits for both', () => {
    expect(bothOf(a, LOADING).value).toBeUndefined();
    expect(bothOf(LOADING, b).value).toBeUndefined();
  });
  it('fails when either fails', () => {
    const error = new Error('down');
    expect(bothOf(a, { error, value: undefined }).error).toBe(error);
    expect(bothOf({ error, value: undefined }, LOADING).error).toBe(error);
  });
});

describe('pageStatusMessage', () => {
  it('says nothing before any block reports', () => {
    expect(pageStatusMessage([])).toBe('');
  });
  it('says the page is loading while one block loads', () => {
    expect(pageStatusMessage([{ heading: 'Notes', status: 'ready' }, { heading: 'À faire', status: 'loading' }])).toBe('Chargement de la page…');
  });
  it('says the page is loaded, empty blocks included', () => {
    expect(pageStatusMessage([{ heading: 'Notes', status: 'empty' }, { heading: 'À faire', status: 'ready' }])).toBe('Page chargée.');
  });
  it('names the blocks that failed', () => {
    expect(pageStatusMessage([{ heading: 'Notes', status: 'error' }, { heading: 'À faire', status: 'ready' }])).toBe(
      'Page chargée. Le bloc « Notes » n’a pas pu être chargé.',
    );
    expect(pageStatusMessage([{ heading: 'Notes', status: 'error' }, { heading: 'Absences', status: 'error' }])).toBe(
      'Page chargée. Ces blocs n’ont pas pu être chargés : Notes, Absences.',
    );
  });
});
