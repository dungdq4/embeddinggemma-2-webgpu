import { useState, useRef, useEffect, useCallback } from 'react';
import { MediaItem, ModelState, SearchResult, SearchQuery, MediaType } from '../types';
import { getInitialShuffledCollection, formatDuration } from '../data/catalog';
import {
  initializeModel,
  subscribeModelState,
  embedQuery,
  searchByEmbedding,
} from '../services/workerClient';
import { extractAudioWaveform } from '../services/audioProcessor';
import { getMediaMetadata } from '../services/videoProcessor';

export function detectFileType(file: File): MediaType | null {
  const mimePrefix = file.type.split('/')[0];
  if (['image', 'video', 'audio', 'text'].includes(mimePrefix)) {
    return mimePrefix as MediaType;
  }

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'svg'].includes(ext ?? '')) return 'image';
  if (['mp4', 'webm', 'ogg', 'mov', 'mkv'].includes(ext ?? '')) return 'video';
  if (['mp3', 'wav', 'flac', 'm4a', 'aac'].includes(ext ?? '')) return 'audio';
  if (['txt', 'md', 'json', 'csv'].includes(ext ?? '')) return 'text';

  return null;
}

let localIdCounter = 0;
const generateLocalId = () => `local-${Date.now().toString(36)}-${++localIdCounter}`;

export function useAtlas() {
  const [collection, setCollection] = useState<MediaItem[]>(() => getInitialShuffledCollection());
  const collectionRef = useRef(collection);

  const [modelState, setModelState] = useState<ModelState>({
    phase: 'loading',
    label: 'Loading dataset',
    backend: 'webgpu',
  });

  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const abortCtrlRef = useRef<AbortController | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordIntervalRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const isStartingRecordRef = useRef(false);
  const isMountedRef = useRef(true);
  const excludedIdsRef = useRef<Set<string>>(new Set());
  const searchSeqRef = useRef(0);

  const updateItem = useCallback((id: string, updates: Partial<MediaItem>) => {
    if (!isMountedRef.current) return;
    const item = collectionRef.current.find((it) => it.id === id);
    if (!item) return;

    const updated = { ...item, ...updates };
    const mapper = (it: MediaItem) => (it.id === id ? updated : it);

    collectionRef.current = collectionRef.current.map(mapper);
    setCollection((prev) => (prev.some((it) => it.id === id) ? prev.map(mapper) : prev));
    setResults((prev) =>
      prev?.some((r) => r.item.id === id)
        ? prev.map((r) => (r.item.id === id ? { ...r, item: updated } : r))
        : prev
    );
    setSelected((prev) => (prev?.id === id ? updated : prev));
  }, []);

  const loadAudioWaveform = useCallback(
    (item: MediaItem, file: Blob) => {
      extractAudioWaveform(file, item.durationSeconds, () => isMountedRef.current).then((res) => {
        if (!res) {
          updateItem(item.id, { waveformStatus: 'unavailable' });
        } else {
          updateItem(item.id, {
            waveform: res.waveform,
            waveformStatus: 'ready',
            durationSeconds: res.durationSeconds,
            duration: formatDuration(res.durationSeconds),
          });
        }
      });
    },
    [updateItem]
  );

  const search = useCallback(
    async (queryObj: SearchQuery) => {
      searchSeqRef.current++;
      abortCtrlRef.current?.abort();

      const ctrl = new AbortController();
      abortCtrlRef.current = ctrl;

      setQuery(queryObj.label);
      setBusy(true);
      setError('');
      setSelected(null);

      try {
        const embedRes = await embedQuery(queryObj, ctrl.signal);

        const searchResults = await searchByEmbedding(embedRes, {
          signal: ctrl.signal,
          excludedIds: [...excludedIdsRef.current],
        });

        if (isMountedRef.current && !ctrl.signal.aborted) {
          const itemMap = new Map(collectionRef.current.map((it) => [it.id, it]));
          setResults(
            searchResults
              .filter((r) => !excludedIdsRef.current.has(r.item.id))
              .map((r) => ({
                ...r,
                item: itemMap.get(r.item.id) ?? r.item,
              }))
          );
          return true;
        }
      } catch (err: any) {
        if (isMountedRef.current && !ctrl.signal.aborted) {
          setError(err?.message || 'Could not search. Please try again.');
        }
      } finally {
        if (isMountedRef.current && !ctrl.signal.aborted) {
          setBusy(false);
        }
      }
      return false;
    },
    []
  );

  const reset = useCallback(() => {
    searchSeqRef.current++;
    abortCtrlRef.current?.abort();
    setCollection(collectionRef.current);
    setResults(null);
    setQuery('');
    setBusy(false);
    setError('');
    setSelected(null);
  }, []);

  const removeItem = useCallback((id: string) => {
    excludedIdsRef.current.add(id);
    collectionRef.current = collectionRef.current.filter((it) => it.id !== id);
    setCollection((prev) => prev.filter((it) => it.id !== id));
    setResults((prev) => (prev ? prev.filter((r) => r.item.id !== id) : null));
    setSelected((prev) => (prev?.id === id ? null : prev));
  }, []);

  const addFile = useCallback(
    async (file: File, name: string = file.name) => {
      if (file.size > 104857600) {
        setError('Choose a file smaller than 100 MB.');
        return;
      }

      const mediaType = detectFileType(file);
      if (!mediaType) {
        setError('Choose an image, video, audio, or text file.');
        return;
      }

      const seq = ++searchSeqRef.current;
      abortCtrlRef.current?.abort();
      setBusy(true);
      setError('');
      setQuery(name);

      const objectUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(objectUrl);

      const isText = mediaType === 'text';
      let textContent: string | undefined;
      if (isText) {
        try {
          textContent = await file.text();
        } catch {
          setError('Could not read text file.');
          setBusy(false);
          return;
        }
      }

      let meta: any = {};
      if (mediaType === 'video' || mediaType === 'audio') {
        meta = await getMediaMetadata(objectUrl, mediaType);
      }

      if (seq !== searchSeqRef.current || !isMountedRef.current) return;

      const item: MediaItem = {
        id: generateLocalId(),
        type: mediaType,
        title: name,
        src: objectUrl,
        thumbnail: mediaType === 'image' ? objectUrl : undefined,
        text: textContent,
        local: true,
        aspectRatio: meta.aspectRatio ?? (mediaType === 'image' ? 1.0 : undefined),
        durationSeconds: meta.durationSeconds,
        duration: meta.durationSeconds ? formatDuration(meta.durationSeconds) : undefined,
        waveformStatus: mediaType === 'audio' ? 'loading' : undefined,
      };

      if (mediaType === 'audio') {
        loadAudioWaveform(item, file);
      }

      collectionRef.current = [item, ...collectionRef.current];
      setCollection((prev) => [item, ...prev]);

      search({
        type: mediaType,
        text: textContent,
        file,
        item,
        label: name,
      });
    },
    [loadAudioWaveform, search]
  );

  const toggleRecording = useCallback(async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      clearInterval(recordIntervalRef.current);
      setRecording(false);
      return;
    }

    if (isStartingRecordRef.current) return;
    isStartingRecordRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const rec = new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      const chunks: Blob[] = [];

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      rec.onstop = () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const file = new File([audioBlob], `recording-${Date.now()}.webm`, { type: 'audio/webm' });
        addFile(file, 'Recorded Sound');
      };

      rec.start();
      setRecording(true);
      setSeconds(0);
      recordIntervalRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s >= 60) {
            rec.stop();
            return 60;
          }
          return s + 1;
        });
      }, 1000);
    } catch (err: any) {
      setError(err?.message || 'Could not access microphone.');
    } finally {
      isStartingRecordRef.current = false;
    }
  }, [addFile, recording]);

  const retryModel = useCallback(() => {
    initializeModel();
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    const unsub = subscribeModelState((s) => {
      if (isMountedRef.current) setModelState(s);
    });

    return () => {
      isMountedRef.current = false;
      unsub();
      objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      clearInterval(recordIntervalRef.current);
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    collection,
    results,
    busy,
    error,
    selected,
    recording,
    seconds,
    modelState,
    search,
    reset,
    setSelected,
    setQuery,
    toggleRecording,
    retryModel,
    addFile,
    removeItem,
    updateItem,
    query,
  };
}
