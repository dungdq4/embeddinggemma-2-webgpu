export type MediaType = 'image' | 'video' | 'audio' | 'text';

export interface MediaItem {
  id: string;
  embeddingId?: string | number;
  type: MediaType;
  title: string;
  description?: string;
  topic?: string;
  thumbnail?: string;
  src?: string;
  poster?: string;
  aspectRatio?: number;
  source?: string;
  color?: string;
  durationSeconds?: number;
  duration?: string;
  waveform?: number[];
  waveformStatus?: 'ready' | 'loading' | 'unavailable';
  playbackEndSeconds?: number;
  text?: string;
  local?: boolean;
  filename?: string;
  relativePath?: string;
  vector?: Float32Array;
  originalMetadata?: Record<string, any>;
}

export interface ModelState {
  phase: 'loading' | 'ready' | 'error';
  label: string;
  backend?: string;
  progress?: number;
  count?: number;
}

export interface SearchQuery {
  type: MediaType;
  text?: string;
  file?: File | Blob;
  item?: MediaItem;
  label: string;
}

export interface SearchResult {
  item: MediaItem;
  score: number;
  similarity: number;
  elapsedMs: number;
}

export interface AtlasController {
  setItems: (items: MediaItem[], scores?: Map<string, number>) => void;
  setEnabled: (enabled: boolean) => void;
  reset: (initial?: { x?: number; y?: number; zoom?: number }) => void;
  zoomBy: (factor: number) => void;
  panBy: (dx: number, dy: number) => void;
  open: (item: MediaItem, direction?: number) => HTMLElement | null;
  close: (callback?: () => void) => void;
  playFocused: (playing: boolean) => void;
  getFocusedVideo?: (item: MediaItem) => HTMLVideoElement | null;
  setFocusedAudioProgress: (item: MediaItem, currentTime: number, duration: number) => void;
  containsFocusPoint: (clientX: number, clientY: number) => boolean;
  destroy: () => void;
}
