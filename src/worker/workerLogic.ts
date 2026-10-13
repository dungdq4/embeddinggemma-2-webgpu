/**
 * Worker Logic & Pipeline Architecture
 * 
 * In this application, the heavy embedding and vector search tasks
 * run completely in a Web Worker to ensure 60fps UI responsiveness.
 * 
 * Pipeline:
 * 1. Initialize:
 *    - Configure ONNX Runtime Web WASM paths (ort-wasm-simd-threaded.asyncify).
 *    - Load AutoProcessor from 'onnx-community/embeddinggemma-2-ONNX'.
 *    - Load AutoModel with { dtype: 'q4', device: 'webgpu' }.
 *    - Fetch and decode local index files (embeddings.f16, audio-embeddings.f16, video-embeddings.f16).
 *    - Normalize all database vectors using L2 norm.
 *    - Warmup model with sample query: "task: search result | query: a photograph".
 * 
 * 2. Embed:
 *    - Text: prefix with "task: search result | query: " -> AutoProcessor -> Model WebGPU -> 768d vector.
 *    - Image: Blob -> ImageProcessor -> Model WebGPU -> 768d vector.
 *    - Audio: Mono Float32Array -> FeatureExtractor -> Model WebGPU -> 768d vector.
 *    - Video: Sampled frames -> Vision Processor -> Model WebGPU -> 768d vector.
 * 
 * 3. Search:
 *    - Compute dot product (Cosine Similarity) against 5,500+ database vectors.
 *    - Calibrate score by modality (e.g. audio offset by 0.08).
 *    - Min-Heap priority queue to extract Top-60 items with score >= 0.65.
 */

export const MODEL_ID = 'onnx-community/embeddinggemma-2-ONNX';
export const QUERY_PREFIX = 'task: search result | query: ';
export const EMBEDDING_DIM = 768;

export function l2Norm(vec: Float32Array, offset = 0, length = EMBEDDING_DIM): number {
  let sumSq = 0;
  for (let i = offset; i < offset + length; i++) {
    const val = vec[i];
    sumSq += val * val;
  }
  const norm = Math.sqrt(sumSq);
  return norm > 0 ? norm : 1;
}

export function normalizeVector(vec: Float32Array, dim = EMBEDDING_DIM): Float32Array {
  const norm = l2Norm(vec, 0, dim);
  for (let i = 0; i < vec.length; i++) {
    vec[i] /= norm;
  }
  return vec;
}

export function calibrateModalityScore(similarity: number, modality: string): number {
  const offset = modality === 'audio' ? 0.08 : 0;
  return Math.max(-1, Math.min(1, (similarity - offset) / (1 - offset)));
}

