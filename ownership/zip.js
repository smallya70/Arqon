/* Minimal zip reader — enough of the format to read an .xlsx.

   Replaces shelling out to `unzip`, which is absent on Windows and on most
   containers. A spreadsheet is a zip of deflated XML, and Node inflates
   deflate natively, so the dependency was never necessary.

   Reads the central directory rather than scanning local headers, because
   local headers may carry zeroed sizes with the real values in a trailing
   data descriptor; the central directory is always authoritative. */

import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

const EOCD = 0x06054b50;   // end of central directory
const CEN  = 0x02014b50;   // central directory file header
const LOC  = 0x04034b50;   // local file header

export function readZip(path) {
  const buf = readFileSync(path);

  // The EOCD sits at the end, after a comment of up to 64k.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--)
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  if (eocd < 0) throw new Error(`${path} is not a zip archive (no end-of-central-directory record).`);

  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  if (off === 0xffffffff)
    throw new Error(`${path} uses zip64. Split the workbook or export it again from Excel.`);

  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== CEN)
      throw new Error(`${path}: central directory entry ${n} is malformed.`);
    const method   = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen  = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const cmtLen   = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name     = buf.toString("utf8", off + 46, off + 46 + nameLen);
    files.set(name, { method, compSize, localOff });
    off += 46 + nameLen + extraLen + cmtLen;
  }

  const read = (name) => {
    const f = files.get(name);
    if (!f) return null;
    if (buf.readUInt32LE(f.localOff) !== LOC)
      throw new Error(`${path}: local header for ${name} is malformed.`);
    // The local header's own name/extra lengths differ from the central ones.
    const nameLen  = buf.readUInt16LE(f.localOff + 26);
    const extraLen = buf.readUInt16LE(f.localOff + 28);
    const start = f.localOff + 30 + nameLen + extraLen;
    const raw = buf.subarray(start, start + f.compSize);
    if (f.method === 0) return raw;                 // stored
    if (f.method === 8) return inflateRawSync(raw); // deflate
    throw new Error(`${path}: ${name} uses compression method ${f.method}, which is not supported.`);
  };

  return {
    names: () => [...files.keys()],
    has: (name) => files.has(name),
    text: (name) => { const b = read(name); return b === null ? null : b.toString("utf8"); },
  };
}
