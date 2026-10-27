import { describe, expect, it } from 'vitest';
import { nextPosition } from './grid-nav';

describe('nextPosition', () => {
  const at = { row: 2, col: 2 };
  const move = (key: string, ctrl = false) => nextPosition(at, key, 7, 5, ctrl);

  it('moves one cell with the arrows', () => {
    expect(move('ArrowUp')).toEqual({ row: 1, col: 2 });
    expect(move('ArrowDown')).toEqual({ row: 3, col: 2 });
    expect(move('ArrowLeft')).toEqual({ row: 2, col: 1 });
    expect(move('ArrowRight')).toEqual({ row: 2, col: 3 });
  });

  it('stays inside the grid', () => {
    expect(nextPosition({ row: 0, col: 0 }, 'ArrowUp', 7, 5)).toEqual({ row: 0, col: 0 });
    expect(nextPosition({ row: 0, col: 0 }, 'ArrowLeft', 7, 5)).toEqual({ row: 0, col: 0 });
    expect(nextPosition({ row: 6, col: 4 }, 'ArrowDown', 7, 5)).toEqual({ row: 6, col: 4 });
    expect(nextPosition({ row: 6, col: 4 }, 'ArrowRight', 7, 5)).toEqual({ row: 6, col: 4 });
  });

  it('jumps to the ends of the row, the column and the grid', () => {
    expect(move('Home')).toEqual({ row: 2, col: 0 });
    expect(move('End')).toEqual({ row: 2, col: 4 });
    expect(move('Home', true)).toEqual({ row: 0, col: 0 });
    expect(move('End', true)).toEqual({ row: 6, col: 4 });
    expect(move('PageUp')).toEqual({ row: 0, col: 2 });
    expect(move('PageDown')).toEqual({ row: 6, col: 2 });
  });

  it('leaves other keys to the browser', () => {
    expect(move('Tab')).toBeNull();
    expect(move('a')).toBeNull();
    expect(move('Enter')).toBeNull();
  });
});
