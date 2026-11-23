import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = (crcTable[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** A solid-colour PNG of the given size, with no dependency (the upload rules have minimum sizes). */
export function solidPng(width: number, height: number, [r, g, b]: [number, number, number]) {
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A solid-colour GIF of the given size (single frame, uncompressed LZW codes: a clear code every
 * two pixels keeps the code size at 3 bits), for upload rules that take GIFs. */
export function solidGif(width: number, height: number) {
  const bits: number[] = [];
  const put = (code: number) => {
    for (let i = 0; i < 3; i++) bits.push((code >> i) & 1);
  };
  const pixels = width * height;
  for (let i = 0; i < pixels; i += 2) {
    put(4); // clear
    put(0);
    if (i + 1 < pixels) put(0);
  }
  put(5); // end of information
  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte |= (bits[i + j] ?? 0) << j;
    bytes.push(byte);
  }
  const blocks: number[] = [];
  for (let i = 0; i < bytes.length; i += 255) {
    const part = bytes.slice(i, i + 255);
    blocks.push(part.length, ...part);
  }
  const le = (n: number) => [n & 0xff, n >> 8];
  return Buffer.from([
    ...Buffer.from("GIF89a"),
    ...le(width),
    ...le(height),
    0x80, // global palette, 2 colours
    0,
    0,
    200, 30, 30, 255, 255, 255,
    0x2c, ...le(0), ...le(0), ...le(width), ...le(height), 0,
    2, // minimum code size
    ...blocks,
    0,
    0x3b,
  ]);
}
