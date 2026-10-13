export const EMBEDDING_DIM = 768;
export const BYTES_PER_VECTOR = EMBEDDING_DIM * 2; // 1,536 bytes

const EXP_TABLE = Float32Array.from({ length: 31 }, (_, i) => 2 ** (i - 25));

/**
 * Decodes raw IEEE 754 half-precision (float16) bytes to standard Float32Array.
 */
export function decodeFloat16(
  buffer: ArrayBuffer | Uint8Array,
  offset = 0,
  count?: number
): Float32Array {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const dataView = new DataView(bytes.buffer, bytes.byteOffset + offset);
  const totalNumbers = count ?? Math.floor((bytes.byteLength - offset) / 2);
  const out = new Float32Array(totalNumbers);

  for (let i = 0; i < totalNumbers; i++) {
    const uint16 = dataView.getUint16(i * 2, true); // little-endian
    const sign = (uint16 & 0x8000) ? -1 : 1;
    const exp = (uint16 >>> 10) & 0x1f;
    const frac = uint16 & 0x03ff;

    let val = 0;
    if (exp === 0) {
      val = frac * (2 ** -24);
    } else if (exp === 31) {
      val = frac ? NaN : Infinity;
    } else {
      val = (1024 + frac) * EXP_TABLE[exp];
    }
    out[i] = sign * val;
  }

  return out;
}

/**
 * Splits raw .f16 bytes into an array of Float32Array vectors (each 768-dimensional).
 */
export function parseF16Vectors(buffer: ArrayBuffer | Uint8Array): Float32Array[] {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const totalVectors = Math.floor(bytes.byteLength / BYTES_PER_VECTOR);
  const vectors: Float32Array[] = [];

  for (let i = 0; i < totalVectors; i++) {
    const vec = decodeFloat16(bytes, i * BYTES_PER_VECTOR, EMBEDDING_DIM);
    vectors.push(vec);
  }

  return vectors;
}

/**
 * Computes Euclidean (L2) norm of a vector.
 */
export function computeL2Norm(vec: Float32Array): number {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) {
    sumSq += vec[i] * vec[i];
  }
  return Math.sqrt(sumSq);
}

/**
 * Computes descriptive statistics for a 768d vector.
 */
export function getVectorStats(vec: Float32Array) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let sumSq = 0;

  for (let i = 0; i < vec.length; i++) {
    const val = vec[i];
    if (val < min) min = val;
    if (val > max) max = val;
    sum += val;
    sumSq += val * val;
  }

  const mean = sum / vec.length;
  const norm = Math.sqrt(sumSq);

  return {
    dim: vec.length,
    min,
    max,
    mean,
    norm,
  };
}

