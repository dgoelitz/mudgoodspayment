#!/usr/bin/env node

import { writeFileSync } from "node:fs";

const text = process.argv[2];

if (!text) {
  console.error('Usage: node scripts/generate-qr.mjs "https://your-vercel-url.vercel.app"');
  process.exit(1);
}

const modeIndicator = 0b0100;
const version = 5;
const size = 17 + version * 4;
const dataCodewords = 108;
const eccCodewords = 26;
const remainderBits = 7;

const bytes = [...Buffer.from(text, "utf8")];

if (bytes.length > 106) {
  console.error("This lightweight QR generator supports URLs up to 106 UTF-8 bytes.");
  console.error("Use a shorter Vercel production URL or a dedicated QR generator for longer URLs.");
  process.exit(1);
}

const bits = [];

function appendBits(value, length) {
  for (let i = length - 1; i >= 0; i -= 1) {
    bits.push((value >>> i) & 1);
  }
}

appendBits(modeIndicator, 4);
appendBits(bytes.length, 8);
bytes.forEach((byte) => appendBits(byte, 8));

const capacityBits = dataCodewords * 8;
appendBits(0, Math.min(4, capacityBits - bits.length));

while (bits.length % 8 !== 0) {
  bits.push(0);
}

const data = [];
for (let i = 0; i < bits.length; i += 8) {
  data.push(Number.parseInt(bits.slice(i, i + 8).join(""), 2));
}

for (let pad = 0; data.length < dataCodewords; pad += 1) {
  data.push(pad % 2 === 0 ? 0xec : 0x11);
}

const gfExp = new Array(512);
const gfLog = new Array(256);
let x = 1;
for (let i = 0; i < 255; i += 1) {
  gfExp[i] = x;
  gfLog[x] = i;
  x <<= 1;
  if (x & 0x100) {
    x ^= 0x11d;
  }
}
for (let i = 255; i < 512; i += 1) {
  gfExp[i] = gfExp[i - 255];
}

function gfMul(a, b) {
  if (a === 0 || b === 0) {
    return 0;
  }
  return gfExp[gfLog[a] + gfLog[b]];
}

function generatorPolynomial(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(poly.length + 1).fill(0);
    poly.forEach((coef, index) => {
      next[index] ^= gfMul(coef, 1);
      next[index + 1] ^= gfMul(coef, gfExp[i]);
    });
    poly = next;
  }
  return poly;
}

function reedSolomon(dataCodewordBytes, degree) {
  const generator = generatorPolynomial(degree);
  const result = new Array(degree).fill(0);

  dataCodewordBytes.forEach((byte) => {
    const factor = byte ^ result.shift();
    result.push(0);
    for (let i = 0; i < degree; i += 1) {
      result[i] ^= gfMul(generator[i + 1], factor);
    }
  });

  return result;
}

const codewords = [...data, ...reedSolomon(data, eccCodewords)];
const modules = Array.from({ length: size }, () => Array(size).fill(null));
const reserved = Array.from({ length: size }, () => Array(size).fill(false));

function setModule(row, col, dark, isReserved = true) {
  if (row < 0 || row >= size || col < 0 || col >= size) {
    return;
  }
  modules[row][col] = Boolean(dark);
  if (isReserved) {
    reserved[row][col] = true;
  }
}

function finder(row, col) {
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const rr = row + r;
      const cc = col + c;
      const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      const inCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      setModule(rr, cc, inOuter && (r === 0 || r === 6 || c === 0 || c === 6 || inCenter));
    }
  }
}

finder(0, 0);
finder(0, size - 7);
finder(size - 7, 0);

for (let i = 8; i < size - 8; i += 1) {
  setModule(6, i, i % 2 === 0);
  setModule(i, 6, i % 2 === 0);
}

function alignment(row, col) {
  for (let r = -2; r <= 2; r += 1) {
    for (let c = -2; c <= 2; c += 1) {
      setModule(row + r, col + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
    }
  }
}

alignment(30, 30);
setModule(size - 8, 8, true);

for (let i = 0; i < 9; i += 1) {
  if (i !== 6) {
    reserved[8][i] = true;
    reserved[i][8] = true;
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }
}

const dataBits = [];
codewords.forEach((byte) => appendCodeword(byte));
for (let i = 0; i < remainderBits; i += 1) {
  dataBits.push(0);
}

function appendCodeword(byte) {
  for (let i = 7; i >= 0; i -= 1) {
    dataBits.push((byte >>> i) & 1);
  }
}

let bitIndex = 0;
let upward = true;
for (let col = size - 1; col > 0; col -= 2) {
  if (col === 6) {
    col -= 1;
  }
  for (let step = 0; step < size; step += 1) {
    const row = upward ? size - 1 - step : step;
    for (let offset = 0; offset < 2; offset += 1) {
      const c = col - offset;
      if (!reserved[row][c]) {
        const mask = (row + c) % 2 === 0;
        modules[row][c] = Boolean(dataBits[bitIndex] ^ mask);
        bitIndex += 1;
      }
    }
  }
  upward = !upward;
}

const format = 0b111011111000100;
for (let i = 0; i < 15; i += 1) {
  const dark = ((format >>> i) & 1) === 1;
  const first = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ][i];
  const second = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8], [size - 5, 8], [size - 6, 8], [size - 7, 8],
    [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1],
  ][i];
  setModule(first[0], first[1], dark);
  setModule(second[0], second[1], dark);
}

const quiet = 4;
const cell = 12;
const svgSize = (size + quiet * 2) * cell;
const rects = [];
for (let row = 0; row < size; row += 1) {
  for (let col = 0; col < size; col += 1) {
    if (modules[row][col]) {
      rects.push(`<rect x="${(col + quiet) * cell}" y="${(row + quiet) * cell}" width="${cell}" height="${cell}"/>`);
    }
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}" role="img" aria-label="QR code">
  <rect width="100%" height="100%" fill="#fff7d8"/>
  <g fill="#3b2d18">
    ${rects.join("\n    ")}
  </g>
</svg>
`;

writeFileSync("qr-code.svg", svg);
console.log("Wrote qr-code.svg");
