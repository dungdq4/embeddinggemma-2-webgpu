import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { MediaItem, AtlasController } from '../types';
import { MediaPlayback } from './MediaPlayback';
import {
  CloseIcon,
  TrashIcon,
  EditIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  ImageIcon,
  VideoIcon,
  AudioIcon,
  TextIcon,
} from './Icons';

interface ViewerModalProps {
  engine: AtlasController;
  item: MediaItem;
  items: MediaItem[];
  onClose: () => void;
  onSelect: (item: MediaItem) => void;
  onDelete?: () => void;
  onDescribe?: (id: string, description: string) => void;
  score?: number;
}

export const ViewerModal: React.FC<ViewerModalProps> = ({
  engine,
  item,
  items,
  onClose,
  onSelect,
  onDelete,
  onDescribe,
  score,
}) => {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const navDirectionRef = useRef<number>(0);
  const currentIndex = items.findIndex((it) => it.id === item.id);
  const navigateBy = (delta: number) => {
    if (!items.length) return;
    navDirectionRef.current = delta;
    const nextIdx = (Math.max(0, currentIndex) + delta + items.length) % items.length;
    onSelect(items[nextIdx]);
  };

  const handlersRef = useRef({ onClose, onSelect, navigateBy });

  useEffect(() => {
    handlersRef.current = { onClose, onSelect, navigateBy };
  }, [onClose, onSelect, navigateBy]);

  useEffect(() => {
    return () => {
      engine.close();
    };
  }, [engine]);

  useLayoutEffect(() => {
    const dir = navDirectionRef.current;
    navDirectionRef.current = 0;
    setPortalTarget(engine.open(item, dir));
  }, [engine, item]);

  // Preload adjacent images for instantaneous smooth transitions
  useEffect(() => {
    if (items.length < 2) return;
    const nextIdx = (currentIndex + 1) % items.length;
    const prevIdx = (currentIndex - 1 + items.length) % items.length;
    [items[nextIdx], items[prevIdx]].forEach((adj) => {
      if (adj?.type === 'image' && (adj.src || adj.thumbnail)) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.src = adj.src || adj.thumbnail || '';
      }
    });
  }, [currentIndex, items]);

  useEffect(() => {
    const prevActive = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(
      () => closeBtnRef.current?.focus({ preventScroll: true }),
      450
    );

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handlersRef.current.onClose();
        return;
      }

      // Check if user is typing in a text field
      const target = e.target as HTMLElement | null;
      const isEditingText =
        target &&
        (/TEXTAREA/.test(target.tagName) ||
          (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range'));

      if (!isEditingText) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handlersRef.current.navigateBy(-1);
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          handlersRef.current.navigateBy(1);
          return;
        }
      }

      if (e.key === 'Tab' && portalTarget) {
        const focusable = [
          ...portalTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href]'
          ),
        ];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && (document.activeElement === first || !portalTarget.contains(document.activeElement))) {
          e.preventDefault();
          last?.focus({ preventScroll: true });
        } else if (!e.shiftKey && (document.activeElement === last || !portalTarget.contains(document.activeElement))) {
          e.preventDefault();
          first?.focus({ preventScroll: true });
        }
      }
    };

    let pointerDownOutside = false;
    const isControlElement = (target: EventTarget | null) =>
      target instanceof Element &&
      !!portalTarget?.contains(target) &&
      !!target.closest('button,input,textarea,a,.viewer-details,.viewer-playback');

    const onPointerDown = (t: PointerEvent) => {
      pointerDownOutside =
        t.button === 0 &&
        !!portalTarget &&
        !isControlElement(t.target) &&
        !engine.containsFocusPoint(t.clientX, t.clientY);
    };

    const onPointerUp = (t: PointerEvent) => {
      if (
        pointerDownOutside &&
        portalTarget &&
        !isControlElement(t.target) &&
        !engine.containsFocusPoint(t.clientX, t.clientY)
      ) {
        handlersRef.current.onClose();
      }
      pointerDownOutside = false;
    };

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let isTouchActive = false;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1 && !isControlElement(e.target)) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = performance.now();
        isTouchActive = true;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!isTouchActive || e.changedTouches.length === 0) return;
      isTouchActive = false;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      const dt = performance.now() - touchStartTime;
      if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.35 && dt < 600) {
        if (dx < 0) {
          handlersRef.current.navigateBy(1); // Swipe left -> next
        } else {
          handlersRef.current.navigateBy(-1); // Swipe right -> prev
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointerup', onPointerUp);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
      prevActive?.focus({ preventScroll: true });
    };
  }, [portalTarget, engine]);

  const iconMap: Record<string, React.FC<any>> = {
    image: ImageIcon,
    video: VideoIcon,
    audio: AudioIcon,
    text: TextIcon,
  };
  const TypeIcon = iconMap[item.type] || ImageIcon;

  if (!portalTarget) return null;

  return createPortal(
    <div className={`viewer-surface viewer-${item.type}`}>
      {item.type === 'text' && (
        <div className="viewer-media">
          <blockquote>{item.text || item.title}</blockquote>
        </div>
      )}

      {(item.type === 'video' || item.type === 'audio') && (
        <MediaPlayback key={item.id} item={item} engine={engine} />
      )}

      <header className="viewer-toolbar">
        <div className="viewer-medium">
          <TypeIcon size={20} strokeWidth={1.5} aria-hidden="true" />
          <span>{item.type}</span>
          {item.duration && <span className="viewer-duration">{item.duration}</span>}
        </div>

        <div className="viewer-actions">
          <div className="viewer-nav" role="group" aria-label="Browse collection">
            <button
              aria-label="Previous item"
              onClick={() => navigateBy(-1)}
              disabled={items.length < 2}
            >
              <ChevronLeftIcon strokeWidth={1.5} />
            </button>
            <span className="viewer-position" aria-hidden="true">
              {Math.max(0, currentIndex) + 1} <span>/ {items.length}</span>
            </span>
            <button
              aria-label="Next item"
              onClick={() => navigateBy(1)}
              disabled={items.length < 2}
            >
              <ChevronRightIcon strokeWidth={1.5} />
            </button>
          </div>

          {item.type === 'image' && (
            <button
              className="viewer-delete"
              aria-label="Delete image"
              title="Delete image from this session"
              onClick={onDelete}
            >
              <TrashIcon strokeWidth={1.5} />
            </button>
          )}

          <button
            ref={closeBtnRef}
            className="viewer-close"
            aria-label="Close viewer"
            onClick={onClose}
          >
            <CloseIcon strokeWidth={1.5} />
          </button>
        </div>
      </header>

      <footer className="viewer-details">
        <div key={item.id} className="viewer-details-content">
          {!item.embeddingId && <h2>{item.title}</h2>}
          {item.type === 'audio' ? (
            <DescriptionEditor key={item.id} item={item} onDescribe={onDescribe} />
          ) : (
            <p>
              {item.local ? (
                'Added for this session'
              ) : item.source ? (
                <a href={item.source} target="_blank" rel="noreferrer">
                  View source <ExternalLinkIcon size={17} aria-hidden="true" />
                </a>
              ) : (
                item.topic
              )}
            </p>
          )}
        </div>

        {score !== undefined && Number.isFinite(score) && (
          <dl key={`score-${item.id}`} className="viewer-score">
            <dt>Relevance</dt>
            <dd>{score.toFixed(3)}</dd>
          </dl>
        )}
      </footer>
    </div>,
    portalTarget
  );
};

interface DescriptionEditorProps {
  item: MediaItem;
  onDescribe?: (id: string, desc: string) => void;
}

const DescriptionEditor: React.FC<DescriptionEditorProps> = ({ item, onDescribe }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.description ?? '');

  if (editing) {
    return (
      <form
        className="description-editor"
        onSubmit={(e) => {
          e.preventDefault();
          onDescribe?.(item.id, value.trim());
          setEditing(false);
        }}
      >
        <label htmlFor="audio-description">Description</label>
        <textarea
          id="audio-description"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Describe the sound, setting, or mood…"
          maxLength={700}
          rows={3}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setEditing(false);
            }
          }}
        />
        <div className="description-editor-actions">
          <button type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
          <button type="submit">Save description</button>
        </div>
      </form>
    );
  }

  return (
    <div className="audio-description">
      {item.description && <p>{item.description}</p>}
      <button
        type="button"
        className="description-edit"
        onClick={() => {
          setValue(item.description ?? '');
          setEditing(true);
        }}
      >
        <EditIcon size={14} strokeWidth={1.5} />
        {item.description ? 'Edit description' : 'Add description'}
      </button>
    </div>
  );
};
