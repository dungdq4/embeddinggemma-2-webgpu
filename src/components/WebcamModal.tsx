import React, { useRef, useState, useEffect, useLayoutEffect, useId } from 'react';
import { CameraIcon, CloseIcon, SpinnerIcon } from './Icons';

interface WebcamModalProps {
  onClose: () => void;
  onCapture: (file: File) => void;
}

export const WebcamModal: React.FC<WebcamModalProps> = ({ onClose, onCapture }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const mountedRef = useRef(true);
  const timeoutRef = useRef<number | undefined>(undefined);

  const dialogId = useId();
  const [loaded, setLoaded] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      dialog.close();
    };
  }, []);

  useEffect(() => {
    let canceled = false;
    mountedRef.current = true;
    setLoaded(false);
    setErrorMessage('');

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera access is unavailable on this device.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (canceled || !mountedRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        if (!canceled && mountedRef.current) {
          setErrorMessage(
            'Camera permission was denied.'
          );
        }
      }
    })();

    return () => {
      canceled = true;
      mountedRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = undefined;
      clearTimeout(timeoutRef.current);
    };
  }, [retryCount]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!loaded || capturing || !video?.videoWidth || !video?.videoHeight) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setErrorMessage('Could not capture a photo. Please try again.');
      return;
    }

    // Mirror horizontally so it feels like a mirror
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    setCapturing(true);

    canvas.toBlob(
      (blob) => {
        if (!mountedRef.current) return;
        if (!blob) {
          setCapturing(false);
          setErrorMessage('Could not capture a photo. Please try again.');
          return;
        }

        streamRef.current?.getTracks().forEach((t) => t.stop());
        const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        timeoutRef.current = window.setTimeout(
          () => {
            if (mountedRef.current) {
              onCapture(new File([blob], 'Webcam photo.jpg', { type: 'image/jpeg' }));
            }
          },
          isReduced ? 0 : 180
        );
      },
      'image/jpeg',
      0.92
    );
  };

  return (
    <dialog
      ref={dialogRef}
      className="webcam-dialog"
      aria-labelledby={`${dialogId}-title`}
      aria-describedby={`${dialogId}-description`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <h2 id={`${dialogId}-title`} className="dialog-title">
        Search with camera
      </h2>
      <p id={`${dialogId}-description`} className="dialog-description">
        Use your front camera to search with a photo.
      </p>

      <div className={`webcam-preview ${capturing ? 'is-capturing' : ''}`}>
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          onLoadedData={() => setLoaded(true)}
          aria-label="Front camera preview"
        />

        <div className="webcam-guides" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>

        {!loaded && !errorMessage && (
          <div className="webcam-message" role="status">
            <SpinnerIcon className="spinner" size={24} />
            <span>Opening camera…</span>
          </div>
        )}

        {errorMessage && (
          <div className="webcam-message" role="alert">
            <CameraIcon size={30} strokeWidth={1.3} />
            <p>{errorMessage}</p>
            <button className="plain-button" onClick={() => setRetryCount((c) => c + 1)}>
              Try again
            </button>
          </div>
        )}
      </div>

      <button
        className="capture-button"
        disabled={!loaded || capturing || !!errorMessage}
        onClick={handleCapture}
      >
        <span aria-hidden="true" />
        <span>{capturing ? 'Photo captured' : 'Capture & search'}</span>
      </button>

      <button className="dialog-close" aria-label="Close" onClick={onClose}>
        <CloseIcon size={18} strokeWidth={1.5} />
      </button>
    </dialog>
  );
};
