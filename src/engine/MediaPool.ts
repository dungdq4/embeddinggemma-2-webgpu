import { MediaItem } from '../types';

export interface MediaEntry {
  id: string;
  item: MediaItem;
  image?: HTMLImageElement;
  video?: HTMLVideoElement;
  canvas?: HTMLCanvasElement;
  ready: boolean;
  lastUsed: number;
}

export class MediaPool {
  entries = new Map<string, MediaEntry>();
  onChange: () => void;
  onFrame: () => void;
  disposed = false;

  constructor(options: { onChange: () => void; onFrame: () => void }) {
    this.onChange = options.onChange;
    this.onFrame = options.onFrame;
  }

  get(item: MediaItem): MediaEntry {
    let entry = this.entries.get(item.id);
    if (!entry) {
      entry = {
        id: item.id,
        item,
        ready: false,
        lastUsed: performance.now(),
      };
      this.entries.set(item.id, entry);
      this.load(entry);
    }
    entry.lastUsed = performance.now();
    return entry;
  }

  load(entry: MediaEntry) {
    const { item } = entry;
    if (item.type === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (this.disposed) return;
        entry.image = img;
        entry.ready = true;
        this.onChange();
      };
      img.src = item.thumbnail || item.src || '';
    } else if (item.type === 'video') {
      if (item.poster) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (this.disposed) return;
          entry.image = img;
          entry.ready = true;
          this.onChange();
        };
        img.src = item.poster;
      }
    } else if (item.type === 'audio') {
      // Create waveform thumbnail canvas
      if (item.waveform?.length) {
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 150;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#12363d';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#38bdf8';
          const bars = item.waveform;
          const barWidth = canvas.width / bars.length;
          bars.forEach((peak, i) => {
            const h = peak * canvas.height * 0.8;
            ctx.fillRect(i * barWidth, (canvas.height - h) / 2, Math.max(1, barWidth - 1), h);
          });
          entry.canvas = canvas;
          entry.ready = true;
          this.onChange();
        }
      }
    }
  }

  dispose() {
    this.disposed = true;
    this.entries.forEach((e) => {
      if (e.video) {
        e.video.pause();
        e.video.removeAttribute('src');
        e.video.load();
      }
    });
    this.entries.clear();
  }
}

