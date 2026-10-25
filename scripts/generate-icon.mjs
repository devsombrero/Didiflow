// Generates build/icon.png (512x512): a rounded blue square with a white "D".
// Dependency-free PNG encoder, so the icon can be regenerated anywhere.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZE = 512;
const RADIUS = 104;
const top = [0x2a, 0x78, 0xd6];
const bottom = [0x31, 0x57, 0xd5];

function insideRoundedSquare(x, y) {
  const cx = Math.min(Math.max(x, RADIUS), SIZE - RADIUS);
  const cy = Math.min(Math.max(y, RADIUS), SIZE - RADIUS);
  return (x - cx) ** 2 + (y - cy) ** 2 <= RADIUS ** 2;
}

function insideLetterD(x, y) {
  const bar = x >= 150 && x <= 206 && y >= 128 && y <= 384;
  const dx = x - 206;
  const dy = y - 256;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const bowl = dx >= 0 && distance <= 128 && distance >= 72;
  const caps = x >= 150 && x <= 206 && ((y >= 128 && y <= 184) || (y >= 328 && y <= 384));
  return bar || bowl || caps;
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  const row = y * (SIZE * 4 + 1);
  raw[row] = 0; // filter: none
  const t = y / (SIZE - 1);
  for (let x = 0; x < SIZE; x++) {
    const offset = row + 1 + x * 4;
    if (!insideRoundedSquare(x, y)) continue; // transparent
    const color = insideLetterD(x, y)
      ? [255, 255, 255]
      : top.map((c, i) => Math.round(c + (bottom[i] - c) * t));
    raw[offset] = color[0];
    raw[offset + 1] = color[1];
    raw[offset + 2] = color[2];
    raw[offset + 3] = 255;
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync('build', { recursive: true });
writeFileSync('build/icon.png', png);
console.log(`build/icon.png written (${png.length} bytes)`);
