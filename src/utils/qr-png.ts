type QrMatrix = {
  size: number;
  data: ArrayLike<number | boolean>;
};

type QrCode = {
  modules: QrMatrix;
};

type QrCreate = (text: string, options?: { errorCorrectionLevel?: "L" | "M" | "Q" | "H" }) => QrCode;

function resolveCreate(moduleValue: unknown): QrCreate {
  const root = moduleValue as { create?: unknown; default?: { create?: unknown } };
  if (typeof root?.create === "function") return root.create as QrCreate;
  if (typeof root?.default?.create === "function") return root.default.create as QrCreate;
  throw new Error("QR encoder does not expose create() in this runtime");
}

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  crcTable = table;
  return table;
}

function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(12 + data.byteLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.byteLength, false);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcInput = new Uint8Array(typeBytes.byteLength + data.byteLength);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.byteLength);
  view.setUint32(8 + data.byteLength, crc32(crcInput), false);
  return out;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const body = new Response(bytes).body;
  if (!body) throw new Error("Unable to create QR PNG compression stream");
  const compressed = body.pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

function grayscaleRaster(matrix: QrMatrix, width: number, marginModules: number): { width: number; height: number; raw: Uint8Array } {
  if (!Number.isInteger(matrix.size) || matrix.size <= 0) throw new Error("QR encoder returned an invalid matrix size");
  const totalModules = matrix.size + marginModules * 2;
  const scale = Math.max(1, Math.floor(width / totalModules));
  const dimension = totalModules * scale;
  const raw = new Uint8Array((dimension + 1) * dimension);

  for (let y = 0; y < dimension; y += 1) {
    const rowOffset = y * (dimension + 1);
    raw[rowOffset] = 0; // PNG filter type: None
    const moduleY = Math.floor(y / scale) - marginModules;
    for (let x = 0; x < dimension; x += 1) {
      const moduleX = Math.floor(x / scale) - marginModules;
      const inside = moduleX >= 0 && moduleY >= 0 && moduleX < matrix.size && moduleY < matrix.size;
      const dark = inside ? Boolean(matrix.data[moduleY * matrix.size + moduleX]) : false;
      raw[rowOffset + 1 + x] = dark ? 0 : 255;
    }
  }

  return { width: dimension, height: dimension, raw };
}

export async function renderQrPng(
  text: string,
  options: { width?: number; margin?: number; errorCorrectionLevel?: "L" | "M" | "Q" | "H" } = {},
): Promise<Uint8Array> {
  const qrModule = await import("qrcode");
  const create = resolveCreate(qrModule);
  const qr = create(text, { errorCorrectionLevel: options.errorCorrectionLevel ?? "M" });
  if (!qr?.modules?.data) throw new Error("QR encoder returned no module matrix");

  const requestedWidth = Math.max(128, Math.floor(options.width ?? 1024));
  const margin = Math.max(0, Math.floor(options.margin ?? 4));
  const raster = grayscaleRaster(qr.modules, requestedWidth, margin);
  const compressed = await deflate(raster.raw);

  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, raster.width, false);
  ihdrView.setUint32(4, raster.height, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return concatBytes([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}
