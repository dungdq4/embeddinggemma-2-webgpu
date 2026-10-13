import { formatDuration } from '../data/catalog';

const AUDIO_SAMPLE_RATE = 16000;

export async function decodeAudioForEmbedding(
  file: Blob,
  signal?: AbortSignal
): Promise<Float32Array> {
  signal?.throwIfAborted();
  const arrayBuffer = await file.arrayBuffer();
  signal?.throwIfAborted();

  const offlineContext = new OfflineAudioContext(1, 1, AUDIO_SAMPLE_RATE);
  const audioBuffer = await offlineContext.decodeAudioData(arrayBuffer);
  signal?.throwIfAborted();

  if (audioBuffer.duration > 60) {
    throw new Error('Audio search supports clips up to 60 seconds.');
  }

  // Mix down all channels to mono
  const mono = new Float32Array(audioBuffer.length);
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < mono.length; i++) {
      mono[i] += channelData[i] / audioBuffer.numberOfChannels;
    }
  }

  return mono;
}

export function computeWaveformPeaks(channels: Float32Array[], points: number = 256): number[] {
  const length = channels[0]?.length ?? 0;
  if (!length) return Array(points).fill(0);

  const peaks = Array.from({ length: points }, (_, i) => {
    const start = Math.floor((i * length) / points);
    const end = Math.max(start + 1, Math.floor(((i + 1) * length) / points));
    const step = Math.max(1, Math.floor((end - start) / 512));

    let maxAmp = 0;
    let sumSq = 0;
    let count = 0;

    for (const channel of channels) {
      for (let s = start; s < Math.min(end, channel.length); s += step) {
        const val = Math.abs(channel[s]);
        maxAmp = Math.max(maxAmp, val);
        sumSq += val * val;
        count++;
      }
    }

    return count ? 0.55 * maxAmp + 0.45 * Math.sqrt(sumSq / count) : 0;
  });

  const maxPeak = Math.max(...peaks);
  return peaks.map((p) => (maxPeak > 0 ? p / maxPeak : 0));
}

let waveformTaskPromise: Promise<any> = Promise.resolve();

export function extractAudioWaveform(
  file: Blob,
  durationSeconds?: number,
  isMounted: () => boolean = () => true
): Promise<{ waveform: number[]; durationSeconds: number } | undefined> {
  const task = waveformTaskPromise.then(async () => {
    if (!isMounted() || file.size > 25165824 || (durationSeconds ?? 0) > 1800) {
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      if (!isMounted()) return;

      const offlineContext = new OfflineAudioContext(1, 1, 12000);
      const audioBuffer = await offlineContext.decodeAudioData(buffer);
      if (!isMounted()) return;

      const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, ch) =>
        audioBuffer.getChannelData(ch)
      );

      return {
        waveform: computeWaveformPeaks(channels, 256),
        durationSeconds: audioBuffer.duration,
      };
    } catch {
      return undefined;
    }
  });

  waveformTaskPromise = task.catch(() => undefined);
  return task;
}

