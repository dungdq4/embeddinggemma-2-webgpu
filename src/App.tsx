import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useAtlas } from './hooks/useAtlas';
import { AtlasCanvas } from './components/AtlasCanvas';
import { ViewerModal } from './components/ViewerModal';
import { WebcamModal } from './components/WebcamModal';
import { formatDuration } from './data/catalog';
import {
  SearchIcon,
  MicIcon,
  StopSquareIcon,
  CameraIcon,
} from './components/Icons';
import { AtlasController, MediaItem } from './types';

export const App: React.FC = () => {
  const atlas = useAtlas();
  const [engineInstance, setEngineInstance] = useState<AtlasController | null>(null);
  const [webcamOpen, setWebcamOpen] = useState(false);

  const controllerRef = useRef<AtlasController | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const displayedItems = useMemo(
    () => (atlas.results ? atlas.results.map((r) => r.item) : atlas.collection),
    [atlas.collection, atlas.results]
  );

  const scoreMap = useMemo(
    () =>
      atlas.results
        ? new Map(atlas.results.map(({ item, score }) => [item.id, score]))
        : undefined,
    [atlas.results]
  );

  const resetExploration = () => {
    atlas.reset();
    if (!atlas.results) {
      controllerRef.current?.reset();
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (atlas.selected || webcamOpen) return;

      const isInput = /INPUT|TEXTAREA/.test((e.target as HTMLElement)?.tagName);
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !isInput)) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === 'Escape') {
        searchInputRef.current?.blur();
        resetExploration();
        return;
      }

      if (isInput) return;

      if (e.key === 'Enter' && displayedItems.length > 0) {
        e.preventDefault();
        atlas.setSelected(displayedItems[0]);
        return;
      }

      if (['+', '=', '-', '0', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
      }

      if (['+', '='].includes(e.key)) controllerRef.current?.zoomBy(1.2);
      if (e.key === '-') controllerRef.current?.zoomBy(1 / 1.2);
      if (e.key === '0') controllerRef.current?.reset();

      const panSteps: Record<string, [number, number]> = {
        ArrowLeft: [-220, 0],
        ArrowRight: [220, 0],
        ArrowUp: [0, -180],
        ArrowDown: [0, 180],
      };

      if (panSteps[e.key]) {
        controllerRef.current?.panBy(...panSteps[e.key]);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const onSelectItem = (item: MediaItem) => atlas.setSelected(item);
  const onCloseItem = () => {
    if (engineInstance) {
      engineInstance.close(() => atlas.setSelected(null));
    } else {
      atlas.setSelected(null);
    }
  };

  const statusCaption = atlas.recording
    ? `Recording · ${formatDuration(atlas.seconds)}`
    : atlas.error ||
      (atlas.modelState.phase === 'ready'
        ? atlas.busy
          ? 'Finding connections…'
          : atlas.results
          ? displayedItems.length
            ? `${displayedItems.length} connections · ${Math.round(atlas.results[0]?.elapsedMs ?? 0)} ms`
            : 'No matches found'
          : ''
        : `${atlas.modelState.label}${
            atlas.modelState.progress !== undefined ? ` · ${Math.round(atlas.modelState.progress)}%` : ''
          }`);

  return (
    <main className={`atlas-app ${atlas.selected ? 'is-presenting' : ''}`}>
      <AtlasCanvas
        items={displayedItems}
        scores={scoreMap}
        enabled={!webcamOpen}
        controller={controllerRef}
        onOpen={onSelectItem}
        onReady={(controller) => setEngineInstance(controller)}
      />

      <header
        className="topbar"
        aria-hidden={!!atlas.selected}
        {...(atlas.selected ? { inert: '' } : {})}
      >
        <button className="brand" onClick={resetExploration} aria-label="Embed Anything, reset exploration">
          <span>
            Search <span className="brand-light">Anything</span>
          </span>
          <span className="brand-subtitle">created by Đặng Quốc Dũng</span>
        </button>
      </header>

      {statusCaption && (
        <div
          className="search-caption"
          role="status"
          aria-hidden={!!atlas.selected}
          {...(atlas.selected ? { inert: '' } : {})}
        >
          <span>{statusCaption}</span>
          {atlas.modelState.phase === 'error' && (
            <button onClick={atlas.retryModel}>Retry</button>
          )}
          {atlas.results && !atlas.busy && <button onClick={resetExploration}>Clear</button>}
        </div>
      )}

      {!displayedItems.length && (
        <div className="canvas-empty">
          <SearchIcon size={25} />
          <h2>No matches yet.</h2>
          <p>Try “ocean waves” or “quiet forest”.</p>
          <button className="plain-button" onClick={resetExploration}>
            Explore everything
          </button>
        </div>
      )}

      <footer
        className="bottom-search"
        aria-hidden={!!atlas.selected}
        {...(atlas.selected ? { inert: '' } : {})}
      >
        <form
          role="search"
          aria-label="Multimodal search"
          className={`search-box ${atlas.busy ? 'is-searching' : ''}`}
          onSubmit={(e) => {
            e.preventDefault();
            if (atlas.query.trim()) {
              atlas.search({
                type: 'text',
                text: atlas.query.trim(),
                label: atlas.query.trim(),
              });
            }
          }}
        >
          <input
            ref={searchInputRef}
            value={atlas.query}
            onChange={(e) => atlas.setQuery(e.target.value)}
            placeholder="Search with text, voice, or camera…"
            aria-label="Search with anything"
            maxLength={500}
            autoComplete="off"
          />

          <button
            type="button"
            className={atlas.recording ? 'is-recording' : undefined}
            aria-label={atlas.recording ? 'Finish recording' : 'Record a sound'}
            onClick={() => void atlas.toggleRecording()}
          >
            {atlas.recording ? (
              <StopSquareIcon size={16} fill="currentColor" />
            ) : (
              <MicIcon size={17} />
            )}
          </button>

          <button
            type="button"
            aria-label="Take a webcam photo"
            title="Take a webcam photo"
            onClick={() => setWebcamOpen(true)}
          >
            <CameraIcon size={18} />
          </button>

          <button
            aria-label="Search collection"
            disabled={!atlas.query.trim() || atlas.busy}
          >
            <SearchIcon size={18} />
          </button>
        </form>
      </footer>

      {webcamOpen && (
        <WebcamModal
          onClose={() => setWebcamOpen(false)}
          onCapture={(file) => {
            setWebcamOpen(false);
            atlas.addFile(file);
          }}
        />
      )}

      {atlas.selected && engineInstance && (
        <ViewerModal
          engine={engineInstance}
          item={atlas.selected}
          items={displayedItems}
          onClose={onCloseItem}
          onSelect={onSelectItem}
          onDelete={() => {
            const id = atlas.selected!.id;
            engineInstance.close(() => searchInputRef.current?.focus());
            atlas.removeItem(id);
          }}
          score={scoreMap?.get(atlas.selected.id)}
          onDescribe={(id, desc) => atlas.updateItem(id, { description: desc })}
        />
      )}
    </main>
  );
};
