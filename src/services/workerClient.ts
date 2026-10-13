import { MediaItem, ModelState, SearchQuery, SearchResult } from '../types';
import { decodeAudioForEmbedding } from './audioProcessor';
import { extractVideoFramesForEmbedding } from './videoProcessor';

let initialModelState: ModelState = {
  phase: 'loading',
  label: 'Loading dataset',
  backend: 'webgpu',
};

let currentModelState: ModelState = initialModelState;
let workerInstance: Worker | undefined;
let requestIdCounter = 0;
let initPromise: Promise<any> | undefined;
const stateListeners = new Set<(state: ModelState) => void>();
const pendingRequests = new Map<
  number,
  {
    resolve: (val: any) => void;
    reject: (err: any) => void;
    cleanup: () => void;
  }
>();

function notifyState(state: ModelState) {
  currentModelState = state;
  stateListeners.forEach((fn) => fn(state));
}

function getWorker(): Worker {
  if (!workerInstance) {
    // Reference the worker in public directory or bundled
    workerInstance = new Worker(new URL('/worker.js', window.location.href), {
      type: 'module',
      name: 'embeddinggemma-worker',
    });

    workerInstance.onmessage = ({ data }) => {
      if (data.type === 'state') {
        notifyState(data.state);
        return;
      }

      const req = pendingRequests.get(data.id);
      if (req) {
        pendingRequests.delete(data.id);
        req.cleanup();
        if (data.type === 'result') {
          req.resolve(data.result);
        } else {
          const err = new Error(data.error?.message || 'Embedding search error');
          err.name = data.error?.name || 'Error';
          req.reject(err);
        }
      }
    };

    workerInstance.onerror = (e) => {
      const err = new Error(e.message || 'Embedding Gemma 2 could not start. Please retry.');
      pendingRequests.forEach((req) => {
        req.cleanup();
        req.reject(err);
      });
      pendingRequests.clear();
      workerInstance?.terminate();
      workerInstance = undefined;
      initPromise = undefined;
      notifyState({
        phase: 'error',
        label: err.message,
        backend: 'webgpu',
      });
    };
  }

  return workerInstance;
}

function sendWorkerMessage<T = any>(payload: any, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }

  return new Promise<T>((resolve, reject) => {
    const worker = getWorker();
    const reqId = ++requestIdCounter;

    const onAbort = () => {
      pendingRequests.delete(reqId);
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
      worker.postMessage({ id: ++requestIdCounter, type: 'cancel', targetId: reqId });
    };

    pendingRequests.set(reqId, {
      resolve,
      reject,
      cleanup: () => signal?.removeEventListener('abort', onAbort),
    });

    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      worker.postMessage({ ...payload, id: reqId });
    } catch (err) {
      pendingRequests.delete(reqId);
      signal?.removeEventListener('abort', onAbort);
      reject(err);
    }
  });
}

export function initializeModel(assetBase: string = new URL('./local/', document.baseURI).href): Promise<any> {
  if (!initPromise) {
    initPromise = sendWorkerMessage({
      type: 'initialize',
      assetBase,
    }).catch((err) => {
      initPromise = undefined;
      throw err;
    });
  }
  return initPromise;
}

export function subscribeModelState(listener: (state: ModelState) => void): () => void {
  stateListeners.add(listener);
  listener(currentModelState);
  return () => {
    stateListeners.delete(listener);
  };
}

export async function embedQuery(query: SearchQuery, signal?: AbortSignal): Promise<{ values: Float32Array; elapsedMs: number }> {
  await initializeModel();
  signal?.throwIfAborted();

  let fileBlob = query.file;
  if (query.type !== 'text' && !query.item?.embeddingId) {
    if (!fileBlob && query.item?.src) {
      const res = await fetch(query.item.src, { signal });
      if (!res.ok) throw new Error(`Could not load this ${query.type} for search.`);
      fileBlob = await res.blob();
    }
    if (!fileBlob) throw new Error(`Choose a ${query.type} to search.`);
  }

  const audioBuffer = query.type === 'audio' && fileBlob ? await decodeAudioForEmbedding(fileBlob, signal) : undefined;
  const videoFrames = query.type === 'video' && fileBlob ? await extractVideoFramesForEmbedding(fileBlob, signal) : undefined;

  return sendWorkerMessage(
    {
      type: 'embed',
      input: {
        type: query.type,
        text: query.text ?? query.item?.text,
        image: query.type === 'image' ? fileBlob : undefined,
        audio: audioBuffer,
        video: videoFrames,
        itemId: query.item?.embeddingId,
      },
    },
    signal
  );
}

export async function searchByEmbedding(
  embedResult: { values: Float32Array; elapsedMs: number },
  options?: { excludedIds?: string[]; signal?: AbortSignal }
): Promise<SearchResult[]> {
  const res = await sendWorkerMessage(
    {
      type: 'search',
      values: embedResult.values,
      limit: 60,
      excludedIds: options?.excludedIds,
    },
    options?.signal
  );

  return res.results.map(({ score, similarity, ...item }: any) => ({
    item: item as MediaItem,
    score,
    similarity,
    elapsedMs: embedResult.elapsedMs + res.elapsedMs,
  }));
}

