/**
 * OverlayCanvasCard - Fullsize image with text overlay
 *
 * Layout:
 * ┌─────────────────────┐
 * │                     │
 * │                     │
 * │    FULLSIZE IMAGE   │  100% height
 * │                     │
 * │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  ← Gradient overlay
 * │ Title          [QR] │
 * │ Subtitle            │
 * └─────────────────────┘
 *
 * Use case: Visual impact cards, hero displays, gallery mode
 */

import type { KoralmEvent } from '../../types/koralmbahn';
import type { AspectRatio, BaseCardConfig, TypographyConfig } from './CardConfig';
import { DEFAULT_OVERLAY_CONFIG } from './CardConfig';
import { FixedSizeCanvasCard } from './FixedSizeCanvasCard';
import type { CardRenderContext } from './BaseCanvasCard';

/**
 * Configuration specific to OverlayCanvasCard
 */
export interface OverlayCardConfig {
  /** Height of gradient overlay as ratio of card height (0.0 - 1.0), default 0.5 */
  gradientHeight: number;

  /** Gradient start color (top, transparent) */
  gradientStartColor: string;

  /** Gradient end color (bottom, dark) */
  gradientEndColor: string;

  /** Text color for overlay content */
  textColor: string;

  /** Subtitle text color */
  subtitleColor: string;

  /** Source label text color */
  sourceColor: string;

  /** Source label font size */
  sourceFontSize: number;

  /** Maximum lines for title, default 2 */
  titleMaxLines: number;

  /** Maximum lines for subtitle, default 1 */
  subtitleMaxLines: number;

  /** Show summary text in overlay */
  showSummary: boolean;

  /** Maximum lines for summary if shown */
  summaryMaxLines: number;

  /** Show source label above title */
  showSource: boolean;
}

const DEFAULT_OVERLAY_CARD_CONFIG: OverlayCardConfig = {
  ...DEFAULT_OVERLAY_CONFIG,
  subtitleColor: 'rgba(255, 255, 255, 0.7)',
  sourceColor: '#ffffff',
  sourceFontSize: 10,
  titleMaxLines: 4, // Allow up to 4 lines, grows upward
  subtitleMaxLines: 3,
  showSummary: false,
  summaryMaxLines: 2,
  showSource: true,
};

/**
 * Card with fullsize image and text overlay at bottom
 */
export class OverlayCanvasCard extends FixedSizeCanvasCard {
  private readonly overlayConfig: OverlayCardConfig;

  constructor(
    event: KoralmEvent,
    aspectRatio: AspectRatio = '4:3',
    overlayConfig: Partial<OverlayCardConfig> = {},
    baseConfig: Partial<BaseCardConfig> = {},
    typography: Partial<TypographyConfig> = {},
  ) {
    super(event, aspectRatio, baseConfig, typography);
    this.overlayConfig = { ...DEFAULT_OVERLAY_CARD_CONFIG, ...overlayConfig };
  }

  /**
   * Render the card
   *
   * When LOD textOpacity is low (card is small), renders image-only mode
   * without gradient, text, or QR code for better performance. Text and
   * gradient fade in smoothly when transitioning back to detail mode.
   */
  render(context: CardRenderContext): void {
    const { ctx, x, y, width, height, image, lodState, scale = 1 } = context;
    const { qrCodeSize } = this.baseConfig;

    // Store screen size for LOD decisions (e.g., borderRadius)
    this.currentScreenSize = {
      width: width * scale,
      height: height * scale,
    };

    // LOD: Image-only mode when card is too small for text
    const textOpacity = lodState?.textOpacity ?? 1;
    const isImageOnlyMode = textOpacity < 0.1;
    const isTransitioning = textOpacity >= 0.1 && textOpacity < 1.0;

    // Background (shadow + border)
    this.renderCardBackground(context);

    // Fullsize image
    if (image && image.complete) {
      this.drawImageCover(ctx, image, x, y, width, height, this.isScreenshot());
    } else {
      this.drawImagePlaceholder(ctx, x, y, width, height, '#1a1a1a');
    }

    // Image-only mode: skip gradient, text, and QR code
    if (isImageOnlyMode) {
      return;
    }

    // Apply fade-in for gradient/text/QR during transition
    if (isTransitioning) {
      ctx.save();
      ctx.globalAlpha = textOpacity;
    }

    // Debug ID (only when F9 debug panel is visible)
    if (context.showDebug) {
      this.drawDebugId(ctx, x, y);
    }

    // Published date (top left)
    this.drawPublishedDate(ctx, x, y);

    // Gradient overlay
    this.drawGradientOverlay(ctx, x, y, width, height);

    // Text content
    this.drawOverlayText(ctx, x, y, width, height);

    // QR Code (bottom right, aligned with source label)
    if (this.baseConfig.showQRCode) {
      const { padding } = this.baseConfig;
      const textPadding = padding * 1.5;
      const qrX = x + width - qrCodeSize - textPadding;
      const qrY = y + height - textPadding - qrCodeSize + 4; // Same bottomOffset as source (0)
      this.drawQRCode(ctx, qrX, qrY, qrCodeSize);
    }

    // Restore alpha if we were transitioning
    if (isTransitioning) {
      ctx.restore();
    }
  }

  /**
   * Draw gradient overlay at bottom of card
   * Respects borderRadius for rounded corners at bottom
   */
  private drawGradientOverlay(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const gradientHeight = height * this.overlayConfig.gradientHeight;
    const gradientY = y + height - gradientHeight;

    const gradient = ctx.createLinearGradient(x, gradientY, x, y + height);
    gradient.addColorStop(0, this.overlayConfig.gradientStartColor);
    gradient.addColorStop(1, this.overlayConfig.gradientEndColor);

    const borderRadius = this.getEffectiveBorderRadius();

    ctx.save();
    ctx.fillStyle = gradient;

    if (borderRadius > 0) {
      // Clip to card shape so gradient respects rounded corners
      this.createRoundedRectPath(ctx, x, y, width, height, borderRadius);
      ctx.clip();
    }

    ctx.fillRect(x, gradientY, width, gradientHeight);
    ctx.restore();
  }

  /**
   * Draw text content over the gradient
   * Layout (bottom to top): Source → Subtitle → Title
   * Title always starts at fixed Y position for consistent card appearance
   */
  private drawOverlayText(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const { padding, qrCodeSize, qrCodePadding, showQRCode } = this.baseConfig;

    // Calculate text area - equal margins left and right
    const textPadding = padding * 1.5;
    const textX = x + textPadding;
    const textWidth = width - textPadding * 2; // Same margin on both sides

    // Reduced width for source/subtitle (QR code is at bottom right)
    const textWidthWithQR = showQRCode
      ? width - textPadding * 2 - qrCodeSize - qrCodePadding
      : textWidth;

    // Large title font (2x normal size)
    const largeTitleFontSize = this.typography.titleFontSize * 2;
    const largeTitleLineHeight = this.typography.titleLineHeight * 2;

    // Fixed layout heights for consistent positioning (3 lines for subtitle)
    const sourceHeight = this.overlayConfig.sourceFontSize + 4;
    const subtitleMaxHeight = 3 * (this.typography.subtitleFontSize + 2) + 4; // Reduced padding
    const titleHeight = this.overlayConfig.titleMaxLines * largeTitleLineHeight;

    // Calculate fixed positions from bottom
    const bottomOffset = 0; // Moved source/QR up 4px
    const sourceY = y + height - textPadding - bottomOffset;
    const subtitleY = sourceY - sourceHeight - subtitleMaxHeight + 1; // Moved up another 5px
    const titleY = subtitleY + 5; // Title stays, subtitle moves up

    // Source label (at bottom)
    if (this.overlayConfig.showSource && this.event.sourceName) {
      ctx.fillStyle = this.overlayConfig.sourceColor;
      ctx.font = `${this.overlayConfig.sourceFontSize}px ${this.typography.fontFamily}`;
      ctx.fillText(this.event.sourceName, textX, sourceY);
    }

    // Subtitle (3 lines max, above source) - uses reduced width if QR present
    const subtitle = this.event.subtitle;
    if (subtitle) {
      ctx.fillStyle = this.overlayConfig.subtitleColor;
      ctx.font = `${this.typography.subtitleFontSize}px ${this.typography.fontFamily}`;
      this.drawMultilineText(
        ctx,
        subtitle,
        textX,
        subtitleY,
        textWidthWithQR,
        this.typography.subtitleFontSize,
        this.overlayConfig.subtitleMaxLines, // Use config (3 lines)
        this.typography.subtitleFontSize + 2,
      );
    }

    // Title (large, 2x font size) - bottom-aligned, grows upward
    ctx.fillStyle = this.overlayConfig.textColor;
    ctx.font = `${this.typography.titleFontWeight} ${largeTitleFontSize}px ${this.typography.fontFamily}`;

    // Calculate actual lines needed for title (inline word-wrap calculation)
    const words = this.event.title.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width > textWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    const actualLineCount = Math.min(lines.length, this.overlayConfig.titleMaxLines);
    const actualTitleHeight = actualLineCount * largeTitleLineHeight;

    // Title Y is fixed at bottom, text starts higher based on actual line count
    const titleStartY = titleY - actualTitleHeight;

    this.drawMultilineText(
      ctx,
      this.event.title,
      textX,
      titleStartY,
      textWidth, // Full width - same margin left and right
      largeTitleFontSize,
      this.overlayConfig.titleMaxLines,
      largeTitleLineHeight,
    );

    // Summary (if enabled, above title)
    if (this.overlayConfig.showSummary && this.event.summary) {
      const summaryY = titleY - titleHeight - this.typography.summaryFontSize - 8;

      ctx.fillStyle = this.overlayConfig.subtitleColor;
      ctx.font = `${this.typography.summaryFontSize}px ${this.typography.fontFamily}`;
      this.drawMultilineText(
        ctx,
        this.event.summary,
        textX,
        summaryY - (this.overlayConfig.summaryMaxLines - 1) * (this.typography.summaryFontSize + 2),
        textWidth,
        this.typography.summaryFontSize,
        this.overlayConfig.summaryMaxLines,
        this.typography.summaryFontSize + 2,
        true,
      );
    }
  }

  /**
   * Draw published date in top left corner with gradient background
   * Respects border radius for top-left corner
   */
  private drawPublishedDate(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
  ): void {
    if (!this.event.publishedAt) return;

    const date = new Date(this.event.publishedAt);
    if (Number.isNaN(date.getTime())) return;

    // Format as DD.MM.YYYY
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const dateStr = `${day}.${month}.${year}`;

    const fontSize = 12;
    const textPadding = 12;
    const bgHeight = (fontSize + textPadding * 2) * 0.7; // 70% of original height
    const borderRadius = this.getEffectiveBorderRadius();

    ctx.save();

    // Measure text width
    ctx.font = `${fontSize}px ${this.typography.fontFamily}`;
    const textWidth = ctx.measureText(dateStr).width;
    const bgWidth = textWidth + textPadding * 3; // Extra space for gradient fade

    // Clip to top-left corner with border radius
    ctx.beginPath();
    if (borderRadius > 0) {
      ctx.moveTo(x + borderRadius, y);
      ctx.lineTo(x + bgWidth, y);
      ctx.lineTo(x + bgWidth, y + bgHeight);
      ctx.lineTo(x, y + bgHeight);
      ctx.lineTo(x, y + borderRadius);
      ctx.arcTo(x, y, x + borderRadius, y, borderRadius);
    } else {
      ctx.rect(x, y, bgWidth, bgHeight);
    }
    ctx.closePath();
    ctx.clip();

    // Horizontal gradient from left (dark) to right (transparent)
    const gradient = ctx.createLinearGradient(x, y, x + bgWidth, y);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
    gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.4)');
    gradient.addColorStop(0.75, 'rgba(0, 0, 0, 0.15)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    // Background rectangle
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, bgWidth, bgHeight);

    // Date text (vertically centered)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    const textY = y + (bgHeight + fontSize * 0.7) / 2;
    ctx.fillText(dateStr, x + textPadding, textY);

    ctx.restore();
  }
}
