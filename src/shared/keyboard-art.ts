import { keys, type Key } from "./keyboard";
import { keyboardView } from "./keyboard-view";

// Top faces measured on the new perspective sprite (2048 x 683 preview).
// Exclude visible vertical keycap faces from highlights and paw targets.
const surfaces = new Map<number, { x: number; y: number; w: number; h: number }>();
const surface = (code: number, x: number, y: number, w: number, h = 54) =>
  surfaces.set(code, {
    x: (x * keyboardView.width) / 2048,
    y: (y * keyboardView.height) / 683,
    w: (w * keyboardView.width) / 2048,
    h: (h * keyboardView.height) / 683,
  });
const cuts = [
  [105, 191, 278, 362, 448, 533, 617, 702, 787, 873, 957, 1040, 1125, 1208, 1378],
  [96, 230, 317, 404, 491, 576, 661, 746, 831, 917, 1002, 1088, 1173, 1258, 1384],
  [90, 250, 340, 428, 516, 604, 692, 780, 868, 955, 1042, 1131, 1204, 1387],
  [82, 299, 386, 473, 562, 649, 737, 824, 912, 999, 1087, 1172, 1391],
  [75, 196, 305, 427, 948, 1066, 1175, 1284, 1395],
];
const rowY = [170, 252, 330, 406, 482];
cuts.forEach((xs, row) =>
  keys
    .filter((k) => k.x < 15 && Math.abs(k.y - (row + 1.4)) < 0.01)
    .forEach((k, i) => surface(k.code, xs[i] + 4, rowY[row] + 2, xs[i + 1] - xs[i] - 9)),
);
const fx = [112, 282, 369, 455, 541, 659, 746, 831, 916, 1042, 1127, 1213, 1297];
keys
  .filter((k) => k.y === 0 && k.x < 15)
  .forEach((k, i) => surface(k.code, fx[i] + 4, 69, i === 0 ? 86 : 70, 56));
keys
  .filter((k) => k.x >= 15.6 && k.x < 19)
  .forEach((k) => {
    const row = Math.round(k.y - 1.4);
    const x = k.y === 0 ? 1399 : row < 2 ? 1408 : 1418;
    surface(k.code, x + Math.round(k.x - 15.6) * 87 + 4,
      k.y === 0 ? 69 : rowY[row] + 2, 72, 54);
  });
keys
  .filter((k) => k.x >= 19.2)
  .forEach((k) => {
    const row = Math.round(k.y - 1.4);
    const x = [1675, 1677, 1681, 1688, 1695][row];
    const col = Math.round(k.x - 19.2);
    const offset = row === 4 && col === 2 ? 140 : col * 78;
    const width = row === 4 && k.w === 2 ? 132 : k.w * 78 - 9;
    surface(k.code, x + offset + 4, rowY[row] + 2, width,
      k.h === 2 ? rowY[row + 1] - rowY[row] + 54 : 54);
  });

export function keySurface(key: Key) {
  return surfaces.get(key.code)!;
}
