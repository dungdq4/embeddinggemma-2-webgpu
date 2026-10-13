import React, { useRef, useEffect } from 'react';
import { MediaItem, AtlasController } from '../types';
import { AtlasEngine } from '../engine/AtlasEngine';

interface AtlasCanvasProps {
  items: MediaItem[];
  scores?: Map<string, number>;
  enabled: boolean;
  controller: React.MutableRefObject<AtlasController | null>;
  onOpen: (item: MediaItem) => void;
  onReady: (controller: AtlasController) => void;
}

export const AtlasCanvas: React.FC<AtlasCanvasProps> = ({
  items,
  scores,
  enabled,
  controller,
  onOpen,
  onReady,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const handlersRef = useRef({ onOpen, onReady });

  useEffect(() => {
    handlersRef.current = { onOpen, onReady };
  }, [onOpen, onReady]);

  useEffect(() => {
    if (!containerRef.current) return;

    const engine = new AtlasEngine(containerRef.current, items, (item) => {
      handlersRef.current.onOpen(item);
    });

    controller.current = engine;
    handlersRef.current.onReady(engine);

    return () => {
      engine.destroy();
      controller.current = null;
    };
  }, [controller]);

  useEffect(() => {
    controller.current?.setItems(items, scores);
  }, [items, scores, controller]);

  useEffect(() => {
    controller.current?.setEnabled(enabled);
  }, [enabled, controller]);

  return <div ref={containerRef} className="atlas-field" tabIndex={-1} />;
};

