export interface GridPosition {
  readonly row: number;
  readonly col: number;
}

/**
 * Where the keyboard focus goes in an ARIA grid (rows × columns of cells): the arrows move one cell, Home
 * and End go to the ends of the row, Ctrl+Home and Ctrl+End to the first and last cell, PageUp and PageDown
 * to the first and last row of the column. Returns null for a key the grid does not handle (so the browser
 * keeps it) and stays inside the grid.
 */
export function nextPosition(
  at: GridPosition,
  key: string,
  rows: number,
  cols: number,
  ctrl = false,
): GridPosition | null {
  const lastRow = rows - 1;
  const lastCol = cols - 1;
  const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);
  switch (key) {
    case 'ArrowUp':
      return { row: clamp(at.row - 1, lastRow), col: at.col };
    case 'ArrowDown':
      return { row: clamp(at.row + 1, lastRow), col: at.col };
    case 'ArrowLeft':
      return { row: at.row, col: clamp(at.col - 1, lastCol) };
    case 'ArrowRight':
      return { row: at.row, col: clamp(at.col + 1, lastCol) };
    case 'Home':
      return ctrl ? { row: 0, col: 0 } : { row: at.row, col: 0 };
    case 'End':
      return ctrl ? { row: lastRow, col: lastCol } : { row: at.row, col: lastCol };
    case 'PageUp':
      return { row: 0, col: at.col };
    case 'PageDown':
      return { row: lastRow, col: at.col };
    default:
      return null;
  }
}
