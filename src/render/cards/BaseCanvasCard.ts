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

  /**
   * Draw card shadow
   */
  protected drawShadow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 5, y - 5, width + 10, height + 10);
    ctx.clip();

    ctx.fillStyle = this.baseConfig.backgroundColor;
    ctx.shadowColor = this.baseConfig.shadowColor;
    ctx.shadowBlur = this.baseConfig.shadowBlur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    ctx.fillRect(x, y, width, height);
    ctx.restore();
  }

  /**
   * Draw card border
   */
  protected drawBorder(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    ctx.strokeStyle = this.baseConfig.borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);
  }

  /**
   * Draw QR code at specified position
   */
  protected drawQRCode(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number = this.baseConfig.qrCodeSize,
  ): void {
    const { qrCode } = this.event;
    // Debug: Log QR code status for first few events
    if (this.event.id && parseInt(this.event.id) < 5) {
      console.log(`[QR Debug] Event ${this.event.id}: qrCode=${qrCode ? 'present' : 'null'}, complete=${qrCode?.complete}`);
    }
    if (!qrCode || !qrCode.complete) return;

    // White background with shadow
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 4;
    ctx.fillRect(x - 2, y - 2, size + 4, size + 4);
    ctx.restore();

    // Border
    ctx.strokeStyle = this.baseConfig.borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 2, y - 2, size + 4, size + 4);

    // QR code image
    ctx.drawImage(qrCode, x, y, size, size);
  }

  /**
   * Draw image with cover mode (fills area, crops overflow)
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

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();

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
   */
  protected drawImagePlaceholder(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string = '#e0e0e0',
  ): void {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);
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
