// Generates every app icon from the brand SVGs in assets/brand.
//
//   npm run icons
//
// Desktop (electron-builder): build/icon.png, build/icon.ico (Windows),
//   build/icon.icns (macOS), build/icons/<size>x<size>.png (Linux).
// Web/renderer: public/favicon.ico, public/brand/*.svg, public/icons/*.png.
// Android: legacy and round launcher PNGs, adaptive foreground/background
//   PNGs per density and the Play Store 512px icon.
// The vector drawables (notification, splash, monochrome) are written by hand
// in android/app/src/main/res from the same paths.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const BRAND = 'assets/brand';
const svg = (name) => path.join(BRAND, name);

/** Renders an SVG to a square PNG buffer. */
async function png(source, size) {
  return sharp(source, { density: Math.max(72, Math.ceil((size / 512) * 72 * 4)) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function writePng(source, size, target) {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, await png(source, size));
}

/** ICO with PNG-compressed images (supported since Windows Vista). */
function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

/** ICNS with PNG payloads (macOS 10.7+). */
function encodeIcns(images) {
  const chunks = images.map(({ type, data }) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

const icon = svg('didiflow-icon.svg');

// ---- Desktop ---------------------------------------------------------------
await writePng(icon, 1024, 'build/icon.png');
for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
  await writePng(icon, size, `build/icons/${size}x${size}.png`);
}
const icoImages = [];
for (const size of [16, 20, 24, 32, 40, 48, 64, 128, 256]) {
  icoImages.push({ size, data: await png(icon, size) });
}
writeFileSync('build/icon.ico', encodeIco(icoImages));

const icnsTypes = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
  ['ic11', 32],
  ['ic12', 64],
  ['ic13', 256],
  ['ic14', 512],
];
const icnsImages = [];
for (const [type, size] of icnsTypes) icnsImages.push({ type, data: await png(icon, size) });
writeFileSync('build/icon.icns', encodeIcns(icnsImages));

// ---- Web / renderer --------------------------------------------------------
mkdirSync('public/brand', { recursive: true });
for (const name of [
  'didiflow-mark.svg',
  'didiflow-mark-white.svg',
  'didiflow-icon.svg',
  'didiflow-logo-light.svg',
  'didiflow-logo-dark.svg',
]) {
  copyFileSync(svg(name), path.join('public/brand', name));
}
writeFileSync(
  'public/favicon.ico',
  encodeIco(
    await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(icon, size) }))),
  ),
);
for (const size of [192, 512]) await writePng(icon, size, `public/icons/icon-${size}.png`);
await writePng(icon, 180, 'public/icons/apple-touch-icon.png');

// ---- Android ---------------------------------------------------------------
const res = 'android/app/src/main/res';
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [density, scale] of Object.entries(densities)) {
  const dir = path.join(res, `mipmap-${density}`);
  await writePng(icon, Math.round(48 * scale), path.join(dir, 'ic_launcher.png'));
  await writePng(
    svg('didiflow-icon-round.svg'),
    Math.round(48 * scale),
    path.join(dir, 'ic_launcher_round.png'),
  );
  await writePng(
    svg('didiflow-adaptive-foreground.svg'),
    Math.round(108 * scale),
    path.join(dir, 'ic_launcher_foreground.png'),
  );
  await writePng(
    svg('didiflow-adaptive-background.svg'),
    Math.round(108 * scale),
    path.join(dir, 'ic_launcher_background.png'),
  );
}
await writePng(icon, 512, 'android/app/src/main/ic_launcher-playstore.png');

console.log('icons: build/, public/ and android/ updated');
