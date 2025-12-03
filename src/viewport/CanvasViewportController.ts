import { ViewportTransform } from 'arkturian-canvas-engine';

import type { KoralmEvent } from '../types/koralmbahn';
import type { DayTimelineBounds } from '../layouts/DayTimelineLayouter';

export class CanvasViewportController {
  private viewport: ViewportTransform | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private resizeHandler: (() => void) | null = null;

  init(canvas: HTMLCanvasElement): ViewportTransform {
    this.canvas = canvas;
    this.configureCanvasSize();
    this.viewport = new ViewportTransform(canvas);

    // Fix viewport dimensions to use CSS pixels instead of canvas pixels
    // The ViewportTransform reads canvas.width/height which include DPR scaling,
    // but centerOn() calculations should use CSS pixels for correct centering on mobile
    this.viewport.viewportWidth = window.innerWidth;
    this.viewport.viewportHeight = window.innerHeight;

    this.attachResizeListener();
    return this.viewport;
  }

  destroy(): void {
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    this.viewport?.destroy();
    this.viewport = null;
    this.canvas = null;
  }

  getViewport(): ViewportTransform | null {
    return this.viewport;
  }

  updateBounds(bounds: DayTimelineBounds | null, events: KoralmEvent[]): void {
    if (!this.viewport || !this.canvas) return;

    const fallbackBounds = this.calculateFallbackBounds(events);
    const resolved = bounds ?? fallbackBounds;

    // Standard padding for both modes
    // Translation bounds enforcement is controlled via setEnableTranslationBounds()
    const paddingX = window.innerWidth * 0.2;
    const paddingY = window.innerHeight * 0.2;

    this.viewport.setContentBounds({
      width: Math.max(resolved.width + paddingX * 2, window.innerWidth),
      height: Math.max(resolved.height + paddingY * 2, window.innerHeight),
      minX: resolved.minX - paddingX,
      minY: resolved.minY - paddingY,
      maxX: resolved.maxX + paddingX,
      maxY: resolved.maxY + paddingY,
    });
  }

  private configureCanvasSize(): void {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;

    const ctx = this.canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }

    // Fix viewport dimensions to use CSS pixels instead of canvas pixels
    // The viewport uses these for centerOn() calculations which should be in CSS pixels
    if (this.viewport) {
      this.viewport.viewportWidth = window.innerWidth;
      this.viewport.viewportHeight = window.innerHeight;
    }
  }

  private attachResizeListener(): void {
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }
    this.resizeHandler = () => {
      this.configureCanvasSize();
      if (this.viewport) {
        this.viewport.updateViewportSize();
        // Re-apply CSS pixel fix after updateViewportSize() resets to canvas pixels
        this.viewport.viewportWidth = window.innerWidth;
        this.viewport.viewportHeight = window.innerHeight;
      }
    };
    window.addEventListener('resize', this.resizeHandler);
  }

  private calculateFallbackBounds(events: KoralmEvent[]): DayTimelineBounds {
    if (events.length === 0) {
      return {
        minX: 0,
        minY: 0,
        maxX: window.innerWidth,
        maxY: window.innerHeight,
        width: window.innerWidth,
        height: window.innerHeight,
      };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    events.forEach(event => {
      if (event.x !== undefined && event.y !== undefined && event.width && event.height) {
        minX = Math.min(minX, event.x);
        minY = Math.min(minY, event.y);
        maxX = Math.max(maxX, event.x + event.width);
        maxY = Math.max(maxY, event.y + event.height);
      }
    });

    if (minX === Infinity || minY === Infinity) {
      return {
        minX: 0,
        minY: 0,
        maxX: window.innerWidth,
        maxY: window.innerHeight,
        width: window.innerWidth,
        height: window.innerHeight,
      };
    }

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }
}
