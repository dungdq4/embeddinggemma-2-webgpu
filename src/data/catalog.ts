import catalogData from './catalog.json';
import { MediaItem } from '../types';

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, '0');
  return m < 60 ? `${m}:${sec}` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${sec}`;
}

export function buildCollections(assetBase: string = './local/'): {
  imageCollection: MediaItem[];
  audioCollection: MediaItem[];
  videoCollection: MediaItem[];
} {
  const data = catalogData as any;
  const assets: any[] = data.assets || [];
  const rawImages: any[] = data.images || assets.filter((a: any) => a.type === 'image');
  const rawAudio: any[] = data.audio || assets.filter((a: any) => a.type === 'audio');
  const rawVideo: any[] = data.video || assets.filter((a: any) => a.type === 'video');

  const imageCollection: MediaItem[] = rawImages.map((img: any, idx: number) => ({
    id: img.id || img.catalog_id || `img_${idx}`,
    embeddingId: img.catalog_id || img.id || `img_${idx}`,
    type: 'image',
    title: img.title || img.description || 'Image',
    description: img.photographer_description || img.description || img.title,
    topic: img.category || img.topic,
    thumbnail: img.url
      ? (img.url.startsWith('http') ? img.url : `https://images.unsplash.com/${img.url}?fm=jpg&fit=max&w=640&h=640&q=90`)
      : `${assetBase}data/${img.relative_path || img.filename}`,
    src: img.url
      ? (img.url.startsWith('http') ? img.url : `https://images.unsplash.com/${img.url}?fm=jpg&fit=max&w=3840&h=3840&q=90`)
      : `${assetBase}data/${img.relative_path || img.filename}`,
    aspectRatio: img.aspect_ratio || 4 / 3,
    source: img.photo_page || img.source,
    color: img.dominant_color ? (img.dominant_color.startsWith('#') ? img.dominant_color : `#${img.dominant_color}`) : undefined,
  }));

  const audioCollection: MediaItem[] = rawAudio.map((aud: any, idx: number) => ({
    id: aud.id || aud.catalog_id || `aud_${idx}`,
    embeddingId: aud.id || aud.catalog_id || `aud_${idx}`,
    type: 'audio',
    title: aud.title || aud.description || 'Audio clip',
    description: aud.description || aud.title,
    topic: aud.topic || 'Sounds',
    src: aud.url ?? `${assetBase}data/${aud.relative_path || aud.local_file || aud.filename}`,
    aspectRatio: 3 / 2,
    durationSeconds: aud.duration_seconds,
    duration: formatDuration(aud.duration_seconds || 0),
    color: aud.dominant_color ? (aud.dominant_color.startsWith('#') ? aud.dominant_color : `#${aud.dominant_color}`) : '#12363d',
    source: aud.source,
    waveform: aud.waveform,
    waveformStatus: 'ready',
    playbackEndSeconds: aud.clip_end_seconds ?? undefined,
  }));

  const videoCollection: MediaItem[] = rawVideo.map((vid: any, idx: number) => ({
    id: vid.id || vid.catalog_id || `vid_${idx}`,
    embeddingId: vid.id || vid.catalog_id || `vid_${idx}`,
    type: 'video',
    title: vid.title || vid.description || 'Video clip',
    description: vid.description || vid.title,
    topic: vid.topic || 'Video',
    src: vid.url ?? `${assetBase}data/${vid.relative_path || vid.filename}`,
    poster: vid.poster
      ? (vid.poster.startsWith('http') ? vid.poster : `${assetBase}data/${vid.poster}`)
      : `${assetBase}data/${vid.relative_path || vid.filename}`,
    aspectRatio: vid.width && vid.height ? vid.width / vid.height : 16 / 9,
    durationSeconds: vid.duration_seconds,
    duration: formatDuration(vid.duration_seconds || 0),
    source: vid.source,
  }));

  return { imageCollection, audioCollection, videoCollection };
}

export function getInitialShuffledCollection(assetBase: string = './local/'): MediaItem[] {
  const { imageCollection, audioCollection, videoCollection } = buildCollections(assetBase);
  const all: MediaItem[] = [...imageCollection, ...audioCollection, ...videoCollection];

  // Fisher-Yates shuffle
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }

  return all;
}
