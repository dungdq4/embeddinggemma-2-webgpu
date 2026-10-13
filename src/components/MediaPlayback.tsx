import React, { useRef, useState, useEffect } from 'react';
import { MediaItem, AtlasController } from '../types';
import { formatDuration } from '../data/catalog';
import { PlayIcon, PauseIcon, VolumeIcon, VolumeMuteIcon } from './Icons';

interface MediaPlaybackProps {
  item: MediaItem;
  engine: AtlasController;
}

export const MediaPlayback: React.FC<MediaPlaybackProps> = ({ item, engine }) => {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const durationRef = useRef(item.durationSeconds);
  const [state, setState] = useState({
    playing: false,
    muted: item.type === 'video',
    time: 0,
    duration: 0,
  });
  const [unavailable, setUnavailable] = useState(false);
  const [buffering, setBuffering] = useState(false);

  useEffect(() => {
    durationRef.current = item.durationSeconds;
    const curDuration = mediaRef.current?.duration;
    if (item.durationSeconds && !(curDuration && Number.isFinite(curDuration))) {
      setState((prev) => ({ ...prev, duration: item.durationSeconds || 0 }));
    }
  }, [item.durationSeconds]);

  useEffect(() => {
    const el =
      item.type === 'video' ? engine.getFocusedVideo?.(item) : mediaRef.current;
    if (!el) return;
    mediaRef.current = el;

    const getEffectiveDuration = () =>
      Math.min(
        Number.isFinite(el.duration) && el.duration > 0
          ? el.duration
          : durationRef.current ?? 0,
        item.playbackEndSeconds ?? Infinity
      );

    let progressTimer = 0;
    const updateAudioProgress = () => {
      clearTimeout(progressTimer);
      if (!(item.type !== 'audio' || document.hidden)) {
        engine.setFocusedAudioProgress(item, el.currentTime, getEffectiveDuration());
        if (!el.paused && !el.ended) {
          progressTimer = window.setTimeout(updateAudioProgress, 100);
        }
      }
    };

    const onStateSync = () => {
      if (
        item.playbackEndSeconds != null &&
        el.currentTime >= item.playbackEndSeconds &&
        !el.paused
      ) {
        el.pause();
        el.currentTime = item.playbackEndSeconds;
      }

      setState({
        playing: !el.paused && !el.ended,
        muted: el.muted,
        time: Number.isFinite(el.currentTime)
          ? Math.min(el.currentTime, getEffectiveDuration())
          : 0,
        duration: getEffectiveDuration(),
      });

      if (el.readyState >= 2) {
        setBuffering(false);
      }
      updateAudioProgress();
    };

    const onError = () => setUnavailable(true);
    const onWaiting = () => setBuffering(true);

    const eventNames = [
      'play',
      'pause',
      'ended',
      'timeupdate',
      'loadedmetadata',
      'durationchange',
      'volumechange',
      'seeking',
      'seeked',
      'canplay',
    ];

    for (const name of eventNames) el.addEventListener(name, onStateSync);
    el.addEventListener('error', onError);
    el.addEventListener('waiting', onWaiting);
    document.addEventListener('visibilitychange', updateAudioProgress);

    if (el.error) onError();
    onStateSync();

    return () => {
      for (const name of eventNames) el.removeEventListener(name, onStateSync);
      el.removeEventListener('error', onError);
      el.removeEventListener('waiting', onWaiting);
      document.removeEventListener('visibilitychange', updateAudioProgress);
      clearTimeout(progressTimer);
      if (item.type === 'audio') el.pause();
    };
  }, [engine, item]);

  const togglePlay = async () => {
    const el = mediaRef.current;
    if (!el) return;

    if (item.type === 'video') {
      engine.playFocused(el.paused || el.ended);
      return;
    }

    if (!el.paused) {
      el.pause();
    } else {
      try {
        if (
          el.ended ||
          (item.playbackEndSeconds != null && el.currentTime >= item.playbackEndSeconds)
        ) {
          el.currentTime = 0;
        }
        await el.play();
      } catch {}
    }
  };

  const onSeek = (seekTime: number) => {
    const el = mediaRef.current;
    if (el && state.duration) {
      el.currentTime = Math.max(0, Math.min(seekTime, state.duration));
      if (item.type === 'audio') {
        engine.setFocusedAudioProgress(item, el.currentTime, state.duration);
      }
      setState((prev) => ({ ...prev, time: el.currentTime }));
    }
  };

  const progressPercent = state.duration
    ? Math.min(100, (state.time / state.duration) * 100)
    : 0;

  return (
    <>
      {item.type === 'audio' && (
        <>
          <audio
            ref={(audioEl) => {
              if (audioEl) mediaRef.current = audioEl;
            }}
            src={item.src}
            preload="metadata"
          />
          {item.waveformStatus && item.waveformStatus !== 'ready' && (
            <p className="waveform-status" role="status">
              {item.waveformStatus === 'loading'
                ? 'Reading waveform…'
                : 'Waveform unavailable'}
            </p>
          )}
        </>
      )}

      <div
        className="viewer-playback"
        data-playing={state.playing}
        role="group"
        aria-label={`${item.type} playback`}
      >
        <button
          className="playback-toggle"
          aria-label={`${state.playing ? 'Pause' : 'Play'} ${item.type}`}
          onClick={() => void togglePlay()}
          disabled={unavailable}
        >
          {state.playing ? (
            <PauseIcon size={22} fill="currentColor" />
          ) : (
            <PlayIcon size={22} fill="currentColor" />
          )}
        </button>

        <input
          className="playback-seek"
          type="range"
          min={0}
          max={state.duration || 1}
          step={0.1}
          value={Math.min(state.time, state.duration || 1)}
          disabled={!state.duration || unavailable}
          aria-label={`Seek ${item.type}`}
          aria-valuetext={`${formatDuration(state.time)} of ${formatDuration(state.duration)}`}
          onChange={(e) => onSeek(Number(e.currentTarget.value))}
          onKeyDown={(e) => {
            if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
              e.preventDefault();
              onSeek(state.time + (e.key === 'ArrowRight' ? 5 : -5));
            }
          }}
          style={{ backgroundSize: `${progressPercent}% 4px, 100% 4px` }}
        />

        <div className="playback-time" role={unavailable ? 'status' : undefined} aria-hidden={!unavailable}>
          {unavailable ? (
            'Unavailable'
          ) : (
            <>
              <span>{formatDuration(state.time)}</span>
              <span className="playback-time-divider">/</span>
              <span>{state.duration ? formatDuration(state.duration) : '—:—'}</span>
            </>
          )}
        </div>

        {item.type === 'video' && (
          <button
            className="playback-mute"
            aria-label={`${state.muted ? 'Unmute' : 'Mute'} video`}
            aria-pressed={!state.muted}
            onClick={() => {
              if (mediaRef.current) {
                mediaRef.current.muted = !mediaRef.current.muted;
              }
            }}
          >
            {state.muted ? <VolumeMuteIcon size={22} /> : <VolumeIcon size={22} />}
          </button>
        )}
      </div>

      {buffering && !unavailable && (
        <span className="playback-buffering" role="status">
          Buffering…
        </span>
      )}
    </>
  );
};
