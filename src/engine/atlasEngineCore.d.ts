import { MediaItem, AtlasController } from '../types';

export declare class AtlasEngine implements AtlasController {
  constructor(host: HTMLElement, items: MediaItem[], onOpen: (item: MediaItem) => void);
  setItems(items: MediaItem[], scores?: Map<string, number>): void;
  setEnabled(enabled: boolean): void;
  reset(initial?: { x?: number; y?: number; zoom?: number }): void;
  zoomBy(factor: number): void;
  panBy(dx: number, dy: number): void;
  open(item: MediaItem, direction?: number): HTMLElement | null;
  close(callback?: () => void): void;
  playFocused(playing: boolean): void;
  getFocusedVideo(item: MediaItem): HTMLVideoElement | null;
  setFocusedAudioProgress(item: MediaItem, currentTime: number, duration: number): void;
  containsFocusPoint(clientX: number, clientY: number): boolean;
  destroy(): void;
}

export declare function computeLayout(items: MediaItem[], targetCols?: number): any;
export declare class CameraController {
  constructor(options: any);
  resize(w: number, h: number): void;
  zoomAt(targetZoom: number, screenX?: number, screenY?: number): void;
  panBy(dx: number, dy: number): void;
  reset(view?: any): void;
}
export declare function createWebGL2Renderer(canvas: HTMLCanvasElement, onFrame: () => void, options?: any): any;
export declare class MediaPool {
  constructor(options: any);
  dispose(): void;
}
export declare function formatDuration(seconds: number): string;
export declare function getMediaMetadata(src: string, type: string): Promise<any>;
export declare function extractAudioWaveform(file: Blob, durationSeconds?: number, isMounted?: () => boolean): Promise<any>;

