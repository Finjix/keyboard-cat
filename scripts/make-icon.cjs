// Small code-native cat mark. This does not modify the generated photographic assets.
const fs = require("node:fs");
fs.mkdirSync("build", { recursive: true });
const pixels = Buffer.alloc(32 * 32 * 4);
for (let y = 0; y < 32; y++)
  for (let x = 0; x < 32; x++) {
    let c = null;
    const circle = (x - 16) ** 2 + (y - 17) ** 2 < 13 ** 2;
    const ear =
      y >= 3 &&
      y < 15 &&
      ((x >= 5 && x <= 5 + (y - 3)) || (x <= 26 && x >= 26 - (y - 3)));
    if (circle || ear) c = [83, 94, 101, 255];
    if (y >= 14 && y <= 19 && ((x >= 9 && x <= 13) || (x >= 19 && x <= 23)))
      c = [230, 183, 78, 255];
    if (y >= 15 && y <= 18 && (x === 11 || x === 21)) c = [31, 34, 37, 255];
    if (y === 23 && (x === 15 || x === 16)) c = [227, 195, 182, 255];
    if (c) {
      const i = ((31 - y) * 32 + x) * 4;
      pixels.set([c[2], c[1], c[0], c[3]], i);
    }
  }
const dib = Buffer.alloc(40);
dib.writeUInt32LE(40);
dib.writeInt32LE(32, 4);
dib.writeInt32LE(64, 8);
dib.writeUInt16LE(1, 12);
dib.writeUInt16LE(32, 14);
dib.writeUInt32LE(pixels.length, 20);
const image = Buffer.concat([dib, pixels, Buffer.alloc(128)]),
  header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header[6] = 32;
header[7] = 32;
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(image.length, 14);
header.writeUInt32LE(22, 18);
const large = Buffer.alloc(256 * 256 * 4);
for (let y = 0; y < 256; y++)
  for (let x = 0; x < 256; x++) {
    const source = (Math.floor(y / 8) * 32 + Math.floor(x / 8)) * 4;
    pixels.copy(large, (y * 256 + x) * 4, source, source + 4);
  }
const ld = Buffer.from(dib);
ld.writeInt32LE(256, 4);
ld.writeInt32LE(512, 8);
ld.writeUInt32LE(large.length, 20);
const li = Buffer.concat([ld, large, Buffer.alloc(8192)]);
const ih = Buffer.alloc(38);
header.copy(ih);
ih.writeUInt16LE(2, 4);
ih.writeUInt32LE(38, 18);
ih.writeUInt16LE(1, 26);
ih.writeUInt16LE(32, 28);
ih.writeUInt32LE(li.length, 30);
ih.writeUInt32LE(38 + image.length, 34);
fs.writeFileSync("build/icon.ico", Buffer.concat([ih, image, li]));
