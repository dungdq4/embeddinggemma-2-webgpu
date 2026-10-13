import { formatDuration } from '../data/catalog';

export interface VideoFrameSample {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  timestamp: number;
}

export interface VideoEmbeddingInput {
  frames: VideoFrameSample[];
  duration: number;
}

export async function extractVideoFramesForEmbedding(
  file: Blob,
  signal?: AbortSignal
): Promise<VideoEmbeddingInput> {
  const video = document.createElement('video');
  const objectUrl = URL.createObjectURL(file);
  video.muted = true;
  video.preload = 'auto';

  const waitForEvent = (eventName: string, action: () => void) =>
    new Promise<void>((resolve, reject) => {
      signal?.throwIfAborted();
      const cleanup = () => {
        clearTimeout(timeoutId);
        video.removeEventListener(eventName, onDone);
        video.removeEventListener('error', onError);
        signal?.removeEventListener('abort', onAbort);
      };
      const onDone = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('Could not decode this video.'));
      };
      const onAbort = () => {
        cleanup();
        reject(new DOMException('Aborted', 'AbortError'));
      };
      const timeoutId = setTimeout(onError, 15000);
      video.addEventListener(eventName, onDone, { once: true });
      video.addEventListener('error', onError, { once: true });
      signal?.addEventListener('abort', onAbort, { once: true });
      action();
    });

  try {
    await waitForEvent('loadeddata', () => {
      video.src = objectUrl;
      video.load();
    });

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('This video has no readable duration.');
    }

    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Video frame decoding is unavailable.');

    const frames: VideoFrameSample[] = [];
    const count = Math.min(32, Math.max(1, Math.ceil(duration)));

    for (let i = 0; i < count; i++) {
      signal?.throwIfAborted();
      const targetTime = count === 1 ? duration / 2 : (i / (count - 1)) * Math.max(0, duration - 0.01);

      if (Math.abs(video.currentTime - targetTime) > 0.001) {
        await waitForEvent('seeked', () => {
          video.currentTime = targetTime;
        });
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      frames.push({
        data: imgData.data,
        width: canvas.width,
        height: canvas.height,
        timestamp: targetTime,
      });
    }

    return { frames, duration };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

export function getMediaMetadata(
  src: string,
  type: string
): Promise<{ aspectRatio: number; durationSeconds?: number; duration?: string; poster?: string }> {
  if (type === 'image') {
    return new Promise((resolve) => {
      const img = new Image();
      const onDone = () => {
        clearTimeout(timer);
        const aspect = img.naturalWidth / img.naturalHeight || 4 / 3;
        img.onload = img.onerror = null;
        img.removeAttribute('src');
        resolve({ aspectRatio: aspect });
      };
      const timer = window.setTimeout(onDone, 5000);
      img.onload = img.onerror = onDone;
      img.src = src;
    });
  }

  if (type === 'text') {
    return Promise.resolve({ aspectRatio: 4 / 3 });
  }

  return new Promise((resolve) => {
    const el = document.createElement(type as 'audio' | 'video');
    el.preload = type === 'video' ? 'auto' : 'metadata';
    el.muted = true;
    if (el instanceof HTMLVideoElement) el.playsInline = true;

    let finished = false;
    const onDone = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);

      const res: { aspectRatio: number; durationSeconds?: number; duration?: string; poster?: string } = {
        aspectRatio: 3 / 2,
      };

      if (Number.isFinite(el.duration) && el.duration > 0) {
        res.durationSeconds = el.duration;
        res.duration = formatDuration(el.duration);
      }

      if (el instanceof HTMLVideoElement && el.videoWidth && el.videoHeight) {
        res.aspectRatio = el.videoWidth / el.videoHeight;
        if (el.readyState >= 2) {
          const scale = Math.min(1, 960 / Math.max(el.videoWidth, el.videoHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(el.videoWidth * scale);
          canvas.height = Math.round(el.videoHeight * scale);
          try {
            canvas.getContext('2d')?.drawImage(el, 0, 0, canvas.width, canvas.height);
            res.poster = canvas.toDataURL('image/jpeg', 0.85);
          } catch {}
        }
      }

      el.onloadedmetadata = el.onloadeddata = el.onerror = null;
      el.removeAttribute('src');
      el.load();
      resolve(res);
    };

    const timer = window.setTimeout(onDone, 5000);
    if (type === 'audio') el.onloadedmetadata = onDone;
    else el.onloadeddata = onDone;
    el.onerror = onDone;
    el.src = src;
  });
}

