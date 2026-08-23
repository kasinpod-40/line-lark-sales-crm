const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const { renderQrPng } = require('../.tmp-test/utils/qr-png.js');

function chunks(png) {
  const out = [];
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = (png[offset] << 24) | (png[offset + 1] << 16) | (png[offset + 2] << 8) | png[offset + 3];
    const type = Buffer.from(png.slice(offset + 4, offset + 8)).toString('ascii');
    const data = png.slice(offset + 8, offset + 8 + length);
    out.push({ type, data });
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return out;
}

test('Workers-compatible QR renderer emits a real lossless PNG without Node toBuffer', async () => {
  const png = await renderQrPng('00020101021129370016A000000677010111011300668123456785802TH53037645406123.456304ABCD', {
    width: 320,
    margin: 4,
    errorCorrectionLevel: 'M',
  });

  assert.ok(png instanceof Uint8Array);
  assert.ok(png.byteLength > 256);
  assert.deepEqual(Array.from(png.slice(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);

  const parsed = chunks(png);
  assert.deepEqual(parsed.map((chunk) => chunk.type), ['IHDR', 'IDAT', 'IEND']);
  assert.equal(parsed[0].data.length, 13);
  const ihdr = Buffer.from(parsed[0].data);
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  assert.equal(width, height);
  assert.ok(width >= 128 && width <= 320);
  assert.equal(ihdr[8], 8, '8-bit grayscale');
  assert.equal(ihdr[9], 0, 'PNG grayscale color type');

  const raw = zlib.inflateSync(Buffer.from(parsed[1].data));
  assert.equal(raw.length, height * (width + 1));
  for (let row = 0; row < height; row += 1) assert.equal(raw[row * (width + 1)], 0, 'filter byte must be None');
  assert.ok(raw.includes(0), 'QR must contain dark pixels');
  assert.ok(raw.includes(255), 'QR must contain light pixels');
});

test('public QR route uses portable matrix renderer and never calls Node-only toBuffer', () => {
  const route = fs.readFileSync(path.join(root, 'src/routes/assets/qr.route.ts'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src/utils/qr-png.ts'), 'utf8');
  assert.match(route, /renderQrPng/);
  assert.doesNotMatch(route, /\.toBuffer\s*\(/);
  assert.doesNotMatch(renderer, /\.toBuffer\s*\(/);
  assert.match(renderer, /CompressionStream\("deflate"\)/);
  assert.match(renderer, /resolveCreate/);
});
