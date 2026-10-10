import { SHAPE_DEFINITIONS, SHAPE_TYPES } from '../config/shapes.js';
import { CROP_KEYS, INITIAL_INVENTORY } from '../config/crops.js';
import { consumeStock, weightedRandomCrop } from './inventoryState.js';

function shuffle(items) {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

function createShapeBag() {
  return shuffle(SHAPE_TYPES.flatMap((shapeType) => [shapeType, shapeType]));
}

function createTetrominoFromShape(shapeType, inventory) {
  const cells = SHAPE_DEFINITIONS[shapeType].map((cell) => ({
    ...cell,
    cropType: null,
  }));

  for (const cell of cells) {
    const cropType = weightedRandomCrop(inventory);

    if (!cropType) {
      break;
    }

    cell.cropType = cropType;
    consumeStock(inventory, cropType, 1);
  }

  return {
    id: crypto.randomUUID(),
    shapeType,
    cells,
  };
}

function ensureBagHasEnoughShapes(bag) {
  if (bag.length >= 3) {
    return bag;
  }

  return [...bag, ...createShapeBag()];
}

export function createHandState(inventory = { ...INITIAL_INVENTORY }) {
  const bag = createShapeBag();
  const slots = Array.from({ length: 3 }, (_, index) => {
    const nextShape = bag.shift() ?? SHAPE_TYPES[Math.floor(Math.random() * SHAPE_TYPES.length)];
    return createTetrominoFromShape(nextShape, inventory);
  });

  return {
    bag: ensureBagHasEnoughShapes(bag),
    slots,
  };
}

export function drawNextShapeForSlot(handState, inventory) {
  const bag = ensureBagHasEnoughShapes(handState.bag);
  const nextShapeType = bag.shift();

  const nextShape = createTetrominoFromShape(nextShapeType, inventory);
  handState.bag = bag;
  return nextShape;
}

export function refillEmptySlot(handState, slotIndex, inventory) {
  if (!handState.slots[slotIndex]) {
    return null;
  }

  const replacement = drawNextShapeForSlot(handState, inventory);
  handState.slots[slotIndex] = replacement;
  return replacement;
}

export function isShapeFullyFilled(tetromino) {
  return tetromino.cells.every((cell) => CROP_KEYS.includes(cell.cropType));
}
