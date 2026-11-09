import { keys, type Key } from "./keyboard";
// Measured key surfaces in the imagegen asset, normalized to its 2048×683 preview.
// These regions only drive highlights and paw targets; the keyboard itself is a PNG.
const surfaces = new Map<
  number,
  { x: number; y: number; w: number; h: number }
>();
const surface = (code: number, x: number, y: number, w: number, h = 82) =>
  surfaces.set(code, {
    x: (x * 930) / 2048,
    y: (y * 310) / 683,
    w: (w * 930) / 2048,
    h: (h * 310) / 683,
  });
const cuts = [
  [
    52, 145, 235, 324, 412, 502, 591, 680, 770, 860, 949, 1038, 1128, 1205,
    1380,
  ],
  [
    52, 192, 281, 370, 459, 548, 637, 726, 815, 904, 993, 1082, 1171, 1260,
    1380,
  ],
  [52, 222, 311, 400, 489, 578, 667, 756, 845, 934, 1023, 1112, 1201, 1380],
  [52, 270, 359, 448, 537, 626, 715, 804, 893, 982, 1071, 1176, 1380],
  [52, 175, 286, 408, 934, 1051, 1168, 1271, 1380],
];
const rowY = [171, 258, 343, 426, 513];
cuts.forEach((xs, row) =>
  keys
    .filter((k) => k.x < 15 && Math.abs(k.y - (row + 1.4)) < 0.01)
    .forEach((k, i) =>
      surface(k.code, xs[i] + 3, rowY[row] + 3, xs[i + 1] - xs[i] - 6, 76),
    ),
);
const fx = [52, 237, 326, 415, 504, 628, 717, 805, 894, 1026, 1115, 1204, 1293];
keys
  .filter((k) => k.y === 0 && k.x < 15)
  .forEach((k, i) => surface(k.code, fx[i] + 3, 69, i === 0 ? 99 : 82, 78));
keys
  .filter((k) => k.x >= 15.6 && k.x < 19)
  .forEach((k) =>
    surface(
      k.code,
      1398 + Math.round(k.x - 15.6) * 89 + 3,
      k.y === 0 ? 69 : rowY[Math.round(k.y - 1.4)] + 3,
      82,
      k.y === 0 ? 78 : 76,
    ),
  );
keys
  .filter((k) => k.x >= 19.2)
  .forEach((k) =>
    surface(
      k.code,
      1685 + Math.round(k.x - 19.2) * 89 + 3,
      rowY[Math.round(k.y - 1.4)] + 3,
      k.w * 89 - 7,
      k.h === 2 ? 158 : 76,
    ),
  );
export function keySurface(key: Key) {
  return surfaces.get(key.code)!;
}
