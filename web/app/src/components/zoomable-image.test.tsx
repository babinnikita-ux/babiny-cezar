import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ZoomableImage } from './zoomable-image';

afterEach(cleanup);

describe('ZoomableImage', () => {
  it('opens a lightbox on click and closes on backdrop click', () => {
    render(<ZoomableImage src="/api/runs/r1/images/shot.png" alt="shot" data-slot="thread-image" />);
    // The thumbnail forwards data-slot and is zoom-in cursored.
    const thumb = document.querySelector('[data-slot="thread-image"]') as HTMLImageElement;
    expect(thumb).toBeTruthy();
    expect(document.querySelector('[data-slot="image-lightbox"]')).toBeNull();

    fireEvent.click(thumb);
    const lightbox = document.querySelector('[data-slot="image-lightbox"]');
    expect(lightbox).not.toBeNull();

    // The scrim is a real button covering the overlay — it takes focus on open so Escape and
    // Enter/Space work without a pointer.
    const scrim = document.querySelector('[data-slot="image-lightbox-close"]') as HTMLButtonElement;
    expect(document.activeElement).toBe(scrim);
    fireEvent.click(scrim);
    expect(document.querySelector('[data-slot="image-lightbox"]')).toBeNull();
    // Focus lands back on the thumbnail trigger, so Tab resumes where the reader left off.
    expect(document.activeElement).toBe(document.querySelector('[data-slot="image-zoom-trigger"]'));
  });

  it('opens from the keyboard — the thumbnail is a real button', () => {
    render(<ZoomableImage src="/img.png" alt="pic" />);
    const trigger = screen.getByRole('button', { name: 'Zoom image: pic' });
    trigger.focus();
    fireEvent.click(trigger); // what Enter/Space dispatch on a native button
    expect(document.querySelector('[data-slot="image-lightbox"]')).not.toBeNull();
  });

  it('closes on Escape', () => {
    render(<ZoomableImage src="/img.png" alt="pic" />);
    fireEvent.click(screen.getByRole('img'));
    expect(document.querySelector('[data-slot="image-lightbox"]')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelector('[data-slot="image-lightbox"]')).toBeNull();
  });
});
