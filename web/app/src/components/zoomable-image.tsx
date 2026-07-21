import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';

import { scopeApiPath } from '@/api/project-scope';

/**
 * An image that enlarges to a full-screen lightbox on click (#image-zoom). Used for conversation
 * images — the agent's own screenshots and the user's attachments — so a thumbnail can be read
 * without leaving the thread. The thumbnail is a real button (Tab/Enter/Space open it); dismiss by
 * clicking the backdrop, pressing Escape, or activating the focused scrim button. The overlay is
 * portalled to <body> so it escapes the thread's overflow/scroll containers.
 *
 * `src` is always a cockpit-served `/api/...` URL (the server persists them into the transcript
 * — `/api/runs/:id/images/…` — and `taskImages`/`runFileRawUrl` are the same origin), so the
 * project scope is applied HERE, at render time (multi-project spec, step 3.1): transcripts
 * store the unscoped legacy URL forever, and re-scoping on use keeps them valid under
 * `/api/p/<id>`. `scopeApiPath` is the identity unscoped and skips already-scoped paths.
 */
export function ZoomableImage({
  src: rawSrc,
  alt = '',
  className,
  ...rest
}: {
  src: string;
  alt?: string;
  className?: string;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'className' | 'onClick'>) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const src = scopeApiPath(rawSrc);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Keyboard round trip: opening parks focus on the overlay's dismiss button, closing hands it
  // back to the thumbnail so Tab resumes where the reader left off. `wasOpen` keeps the restore
  // from firing on mount, where nothing was focused here to begin with.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) closer.current?.focus();
    else if (wasOpen.current) trigger.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);

  return (
    <>
      {/* The thumbnail is a real <button> so the zoom is reachable by Tab/Enter/Space, not just
          by pointer. The reset classes keep it visually identical to the bare <img> it wraps. */}
      <button
        type="button"
        ref={trigger}
        data-slot="image-zoom-trigger"
        aria-label={alt ? `Zoom image: ${alt}` : 'Zoom image'}
        onClick={() => setOpen(true)}
        className="block h-fit w-fit max-w-full cursor-zoom-in appearance-none border-0 bg-transparent p-0 text-left leading-none"
      >
        <img {...rest} src={src} alt={alt} loading="lazy" className={className} />
      </button>
      {open
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Image preview"
              data-slot="image-lightbox"
              className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            >
              {/* The scrim is the dismiss control, as a focusable button covering the whole
                  overlay — clicking anywhere (the enlarged image included, hence its
                  pointer-events-none) closes, and it takes focus so Escape/Enter/Space work
                  the moment the lightbox opens. */}
              <button
                type="button"
                ref={closer}
                data-slot="image-lightbox-close"
                aria-label="Close image preview"
                onClick={() => setOpen(false)}
                className="absolute inset-0 cursor-zoom-out appearance-none border-0 bg-transparent p-0"
              />
              <img
                src={src}
                alt={alt}
                className="pointer-events-none relative max-h-full max-w-full rounded-md object-contain shadow-2xl"
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
