/**
 * BaseCanvasCard - Abstract base class for all canvas card renderers
 *
 * Provides common functionality for:
 * - Shadow and border rendering
 * - QR code rendering
 * - Multi-line text rendering with truncation
 * - Image drawing with cover/contain modes
 *
 * All concrete card implementations must extend this class.
 */

import type { KoralmEvent } from '../../types/koralmbahn';
import {
  type BaseCardConfig,
  type TypographyConfig,
  DEFAULT_BASE_CONFIG,
  DEFAULT_TYPOGRAPHY,
} from './CardConfig';

/**
 * Render context passed to card render method
 */
export interface CardRenderContext {
  /** Canvas 2D rendering context */
  ctx: CanvasRenderingContext2D;

  /** X position of card */
  x: number;

  /** Y position of card */
  y: number;

  /** Card width */
  width: number;

  /** Card height */
  height: number;

  /** Loaded image (or null if not loaded) */
  image: HTMLImageElement | null;

  /** LOD transition state */
  lodState?: {
    imageHeightPercent: number;
    textOpacity: number;
  };

  /** Show debug info (ID overlay) - synced with F9 debug panel */
  showDebug?: boolean;

  /** Current viewport scale (for LOD calculations) */
  scale?: number;
}

/**
 * Abstract base class for canvas cards
 */
export abstract class BaseCanvasCard {
  /** Event data to render */
  protected readonly event: KoralmEvent;

  /** Base configuration */
  protected readonly baseConfig: BaseCardConfig;

  /** Typography configuration */
  protected readonly typography: TypographyConfig;

  constructor(
    event: KoralmEvent,
    baseConfig: Partial<BaseCardConfig> = {},
    typography: Partial<TypographyConfig> = {},
  ) {
    this.event = event;
    this.baseConfig = { ...DEFAULT_BASE_CONFIG, ...baseConfig };
    this.typography = { ...DEFAULT_TYPOGRAPHY, ...typography };
  }

  /**
   * Render the card - must be implemented by subclasses
   */
  abstract render(context: CardRenderContext): void;

  /**
   * Get the event data
   */
  getEvent(): KoralmEvent {
    return this.event;
  }

  /**
   * Detect if the event image is a screenshot (for alignment purposes)
   */
  protected isScreenshot(): boolean {
    const { event } = this;
    return !!(
      event.sourceName?.includes('Screenshot') ||
      event.imageUrl?.includes('#screenshot') ||
      event.imageUrl?.toLowerCase().includes('playwright') ||
      event.imageUrl?.toLowerCase().includes('screenshot')
    );
  }

  /** Current card screen size for LOD decisions (set by render method) */
  protected currentScreenSize?: { width: number; height: number };

  /** Minimum screen width (px) below which rounded corners are disabled for performance */
  private static readonly CORNER_RADIUS_MIN_WIDTH = 100;

  /**
   * Get effective border radius (0 when card is small on screen for performance)
   */
  protected getEffectiveBorderRadius(): number {
    const { borderRadius } = this.baseConfig;
    if (borderRadius <= 0) return 0;

    // Disable rounded corners when cards are small on screen
    const screenWidth = this.currentScreenSize?.width ?? 999;
    if (screenWidth < BaseCanvasCard.CORNER_RADIUS_MIN_WIDTH) {
      return 0;
    }

    return borderRadius;
  }

  /**
   * Create a rounded rectangle path
   * Uses native roundRect if available, falls back to manual path
   */
  protected createRoundedRectPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    // Clamp radius to half the smallest dimension
    const r = Math.min(radius, width / 2, height / 2);

    ctx.beginPath();
    if (ctx.roundRect) {
      // Native roundRect (modern browsers)
      ctx.roundRect(x, y, width, height, r);
    } else {
      // Fallback for older browsers
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + width - r, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + r);
      ctx.lineTo(x + width, y + height - r);
      ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      ctx.lineTo(x + r, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
    }
    ctx.closePath();
  }

  /**
   * Draw card shadow (with optional rounded corners, LOD-aware)
   */
  protected drawShadow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const borderRadius = this.getEffectiveBorderRadius();

    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 5, y - 5, width + 10, height + 10);
    ctx.clip();

    ctx.fillStyle = this.baseConfig.backgroundColor;
    ctx.shadowColor = this.baseConfig.shadowColor;
    ctx.shadowBlur = this.baseConfig.shadowBlur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;

    if (borderRadius > 0) {
      this.createRoundedRectPath(ctx, x, y, width, height, borderRadius);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, width, height);
    }
    ctx.restore();
  }

  /**
   * Draw card border (with optional rounded corners, LOD-aware)
   */
  protected drawBorder(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const borderRadius = this.getEffectiveBorderRadius();

    ctx.strokeStyle = this.baseConfig.borderColor;
    ctx.lineWidth = 1;

    if (borderRadius > 0) {
      this.createRoundedRectPath(ctx, x, y, width, height, borderRadius);
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, width, height);
    }
  }

  /**
   * Draw QR code at specified position
   * Renders white QR code with transparent background (no border/shadow)
   */
  protected drawQRCode(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number = this.baseConfig.qrCodeSize,
  ): void {
    const { qrCode } = this.event;
    if (!qrCode || !qrCode.complete) return;

    // QR code image (white on transparent, no background/border)
    ctx.drawImage(qrCode, x, y, size, size);
  }

  /**
   * Draw image with cover mode (fills area, crops overflow)
   * Respects borderRadius for rounded corners clipping (LOD-aware)
   *
   * @param alignTop - If true, align image to top (for screenshots). Default centers.
   */
  protected drawImageCover(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number,
    y: number,
    width: number,
    height: number,
    alignTop: boolean = false,
  ): void {
    if (!img.complete) return;

    const borderRadius = this.getEffectiveBorderRadius();

    ctx.save();

    // Clip to rounded rectangle if borderRadius is set
    if (borderRadius > 0) {
      this.createRoundedRectPath(ctx, x, y, width, height, borderRadius);
      ctx.clip();
    } else {
      ctx.beginPath();
      ctx.rect(x, y, width, height);
      ctx.clip();
    }

    const imgAspect = img.width / img.height;
    const targetAspect = width / height;

    let drawWidth = width;
    let drawHeight = height;
    let offsetX = 0;
    let offsetY = 0;

    if (imgAspect > targetAspect) {
      // Image wider than container
      drawHeight = height;
      drawWidth = height * imgAspect;
      offsetX = -(drawWidth - width) / 2;
    } else {
      // Image taller than container
      drawWidth = width;
      drawHeight = width / imgAspect;
      offsetY = alignTop ? 0 : -(drawHeight - height) / 2;
    }

    ctx.drawImage(img, x + offsetX, y + offsetY, drawWidth, drawHeight);
    ctx.restore();
  }

  /**
   * Draw image with contain mode (fits entirely, may have letterboxing)
   */
  protected drawImageContain(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    if (!img.complete) return;

    const imgAspect = img.width / img.height;
    const targetAspect = width / height;

    let drawWidth = width;
    let drawHeight = height;
    let offsetX = 0;
    let offsetY = 0;

    if (imgAspect > targetAspect) {
      // Image wider: fit to width
      drawWidth = width;
      drawHeight = width / imgAspect;
      offsetY = (height - drawHeight) / 2;
    } else {
      // Image taller: fit to height
      drawHeight = height;
      drawWidth = height * imgAspect;
      offsetX = (width - drawWidth) / 2;
    }

    ctx.drawImage(img, x + offsetX, y + offsetY, drawWidth, drawHeight);
  }

  /**
   * Draw placeholder rectangle when image is loading
   * Respects borderRadius for rounded corners (LOD-aware)
   */
  protected drawImagePlaceholder(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string = '#e0e0e0',
  ): void {
    const borderRadius = this.getEffectiveBorderRadius();

    ctx.fillStyle = color;

    if (borderRadius > 0) {
      this.createRoundedRectPath(ctx, x, y, width, height, borderRadius);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, width, height);
    }
  }

  /**
   * Draw multi-line text with word wrapping and optional truncation
   *
   * @returns Y position after the last line
   */
  protected drawMultilineText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    startY: number,
    maxWidth: number,
    fontSize: number,
    maxLines: number,
    lineHeight: number,
    appendEllipsis: boolean = false,
  ): number {
    if (!text) return startY;

    // Handle URLs: split at special characters
    const isUrl = text.startsWith('http://') || text.startsWith('https://');
    let words: string[];

    if (isUrl) {
      words = text.split(/([/?&=])/g).filter((part) => part.length > 0);
    } else {
      words = text.split(' ');
    }

    const lines: string[] = [];
    let currentLine = '';

    words.forEach((word) => {
      const separator = isUrl || !currentLine ? '' : ' ';
      const testLine = currentLine ? `${currentLine}${separator}${word}` : word;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    const limit = Math.min(maxLines, lines.length);
    for (let i = 0; i < limit; i++) {
      const isLastAllowedLine = i === limit - 1;
      const needsEllipsis = appendEllipsis && isLastAllowedLine && lines.length > maxLines;
      const content = needsEllipsis ? `${lines[i]}...` : lines[i];
      ctx.fillText(content, x, startY + i * lineHeight);
    }

    return startY + limit * lineHeight + (limit > 0 ? 0 : fontSize);
  }

  /**
   * Draw debug ID overlay (top-left of image area)
   */
  protected drawDebugId(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
  ): void {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(x + 4, y + 4, 70, 16);
    ctx.fillStyle = '#ffffff';
    ctx.font = '9px monospace';
    ctx.fillText(`ID: ${this.event.id}`, x + 8, y + 15);
    ctx.restore();
  }

  /**
   * Set text style for title
   */
  protected setTitleStyle(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.typography.titleColor;
    ctx.font = `${this.typography.titleFontWeight} ${this.typography.titleFontSize}px ${this.typography.fontFamily}`;
  }

  /**
   * Set text style for subtitle
   */
  protected setSubtitleStyle(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.typography.subtitleColor;
    ctx.font = `${this.typography.subtitleFontSize}px ${this.typography.fontFamily}`;
  }

  /**
   * Set text style for summary
   */
  protected setSummaryStyle(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.typography.summaryColor;
    ctx.font = `${this.typography.summaryFontSize}px ${this.typography.fontFamily}`;
  }
}
