import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

const glyphs = {
  O: ["111", "101", "101", "101", "111"],
  R: ["110", "101", "110", "101", "101"]
};

function makeIcon(size, maskable = false) {
  const pixels = Buffer.alloc(size * size * 4);
  const set = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; pixels[i + 3] = 255;
  };
  const green = [0, 122, 89], dark = [11, 29, 25], cream = [248, 245, 235], lime = [189, 224, 63];
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const edge = maskable ? 0 : size * 0.07;
    const rounded = !maskable && ((x < edge && y < edge && (x-edge)**2 + (y-edge)**2 > edge**2) ||
      (x > size-edge && y < edge && (x-(size-edge))**2 + (y-edge)**2 > edge**2) ||
      (x < edge && y > size-edge && (x-edge)**2 + (y-(size-edge))**2 > edge**2) ||
      (x > size-edge && y > size-edge && (x-(size-edge))**2 + (y-(size-edge))**2 > edge**2));
    set(x, y, rounded ? [0, 0, 0, 0] : (x + y > size * 1.5 ? dark : green));
    if (rounded) pixels[(y * size + x) * 4 + 3] = 0;
  }
  for (let stripe = -size; stripe < size * 2; stripe += size * 0.19) {
    for (let y = Math.floor(size * 0.58); y < size; y += 1) {
      const x = Math.floor(stripe + (y - size * 0.58) * 0.58);
      for (let w = 0; w < Math.max(2, size * 0.018); w += 1) set(x + w, y, lime);
    }
  }
  const scale = Math.floor(size * 0.105);
  const startX = Math.floor(size * 0.19), startY = Math.floor(size * 0.20);
  for (const [letterIndex, letter] of ["O", "R"].entries()) {
    glyphs[letter].forEach((row, gy) => [...row].forEach((bit, gx) => {
      if (bit === "1") for (let py = 0; py < scale; py += 1) for (let px = 0; px < scale; px += 1) {
        set(startX + letterIndex * scale * 4 + gx * scale + px, startY + gy * scale + py, cream);
      }
    }));
  }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

await fs.mkdir("icons", { recursive: true });
await fs.writeFile(path.join("icons", "icon-192.png"), makeIcon(192));
await fs.writeFile(path.join("icons", "icon-512.png"), makeIcon(512));
await fs.writeFile(path.join("icons", "icon-maskable-512.png"), makeIcon(512, true));
console.log("Generated OREC PWA icons.");
