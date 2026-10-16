export const GRID_SIZE = 6;

export function createGrid(rows = GRID_SIZE, cols = GRID_SIZE) {
  return Array.from({ length: rows }, () => Array(cols).fill(null));
}

export function cloneGrid(grid) {
  return grid.map((row) => [...row]);
}

export function isInsideGrid(row, col, rows = GRID_SIZE, cols = GRID_SIZE) {
  return row >= 0 && row < rows && col >= 0 && col < cols;
}

export function canPlaceShape(grid, shape, originRow = 0, originCol = 0) {
  if (!shape || !Array.isArray(shape.cells)) {
    return false;
  }

  for (const cell of shape.cells) {
    const row = originRow + cell.row;
    const col = originCol + cell.col;

    if (!isInsideGrid(row, col, grid.length, grid[0].length)) {
      return false;
    }

    if (grid[row][col] !== null) {
      return false;
    }
  }

  return true;
}

export function placeShapeOnGrid(grid, shape, originRow = 0, originCol = 0) {
  const nextGrid = cloneGrid(grid);

  if (!canPlaceShape(nextGrid, shape, originRow, originCol)) {
    return null;
  }

  for (const block of shape.cells) {
    const row = originRow + block.row;
    const col = originCol + block.col;
    nextGrid[row][col] = block.cropType ?? null;
  }

  return nextGrid;
}

export function findConnectedGroup(grid, startRow, startCol, targetType = grid[startRow]?.[startCol]) {
  if (!grid[startRow] || grid[startRow][startCol] !== targetType) {
    return [];
  }

  const visited = new Set();
  const queue = [[startRow, startCol]];
  const connected = [];

  while (queue.length > 0) {
    const [row, col] = queue.shift();
    const key = `${row}:${col}`;

    if (visited.has(key)) {
      continue;
    }

    visited.add(key);
    connected.push({ row, col });

    const neighbors = [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1],
    ];

    for (const [nextRow, nextCol] of neighbors) {
      if (!isInsideGrid(nextRow, nextCol, grid.length, grid[0].length)) {
        continue;
      }

      if (grid[nextRow][nextCol] === targetType && !visited.has(`${nextRow}:${nextCol}`)) {
        queue.push([nextRow, nextCol]);
      }
    }
  }

  return connected;
}

export function findAllConnectedGroups(grid) {
  const seen = new Set();
  const groups = [];

  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
      const cropType = grid[row][col];
      if (!cropType || seen.has(`${row}:${col}`)) {
        continue;
      }

      const cells = findConnectedGroup(grid, row, col);
      for (const cell of cells) {
        seen.add(`${cell.row}:${cell.col}`);
      }
      groups.push({ cropType, cells });
    }
  }

  return groups;
}

export function clearConnectedCells(grid, cells) {
  const nextGrid = cloneGrid(grid);

  for (const cell of cells) {
    nextGrid[cell.row][cell.col] = null;
  }

  return nextGrid;
}
