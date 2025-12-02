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

  /** Maximum lines for title, default 2 */
  titleMaxLines: number;

  /** Maximum lines for subtitle, default 1 */
  subtitleMaxLines: number;

  /** Show summary text in overlay */
  showSummary: boolean;

  /** Maximum lines for summary if shown */
  summaryMaxLines: number;
}

const DEFAULT_OVERLAY_CARD_CONFIG: OverlayCardConfig = {
  ...DEFAULT_OVERLAY_CONFIG,
  subtitleColor: 'rgba(255, 255, 255, 0.7)',
  titleMaxLines: 2,
  subtitleMaxLines: 1,
  showSummary: false,
  summaryMaxLines: 2,
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
   */
  render(context: CardRenderContext): void {
    const { ctx, x, y, width, height, image } = context;
    const { qrCodeSize, qrCodePadding } = this.baseConfig;

    // Background (shadow + border)
    this.renderCardBackground(context);

    // Fullsize image
    if (image && image.complete) {
      this.drawImageCover(ctx, image, x, y, width, height, this.isScreenshot());
    } else {
      this.drawImagePlaceholder(ctx, x, y, width, height, '#1a1a1a');
    }

    // Debug ID
    this.drawDebugId(ctx, x, y);

    // Gradient overlay
    this.drawGradientOverlay(ctx, x, y, width, height);

    // Text content
    this.drawOverlayText(ctx, x, y, width, height);

    // QR Code (bottom-right)
    if (this.baseConfig.showQRCode) {
      const qrX = x + width - qrCodeSize - qrCodePadding;
      const qrY = y + height - qrCodeSize - qrCodePadding;
      this.drawQRCode(ctx, qrX, qrY, qrCodeSize);
    }
  }

  /**
   * Draw gradient overlay at bottom of card
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

    ctx.fillStyle = gradient;
    ctx.fillRect(x, gradientY, width, gradientHeight);
  }

  /**
   * Draw text content over the gradient
   */
  private drawOverlayText(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const { padding, qrCodeSize, qrCodePadding, showQRCode } = this.baseConfig;

    // Calculate text area (from bottom up)
    const textPadding = padding * 1.5;
    const textX = x + textPadding;
    const textWidth = showQRCode
      ? width - textPadding * 2 - qrCodeSize - qrCodePadding
      : width - textPadding * 2;

    // Start from bottom and work up
    let bottomY = y + height - textPadding;

    // Summary (if enabled, from bottom)
    if (this.overlayConfig.showSummary && this.event.summary) {
      const summaryHeight = this.overlayConfig.summaryMaxLines * (this.typography.summaryFontSize + 2);
      const summaryY = bottomY - summaryHeight;

      ctx.fillStyle = this.overlayConfig.subtitleColor;
      ctx.font = `${this.typography.summaryFontSize}px ${this.typography.fontFamily}`;
      this.drawMultilineText(
        ctx,
        this.event.summary,
        textX,
        summaryY,
        textWidth,
        this.typography.summaryFontSize,
        this.overlayConfig.summaryMaxLines,
        this.typography.summaryFontSize + 2,
        true,
      );

      bottomY = summaryY - 6;
    }

    // Subtitle
    const subtitle = this.event.subtitle || this.event.sourceName;
    if (subtitle) {
      const subtitleHeight = this.overlayConfig.subtitleMaxLines * (this.typography.subtitleFontSize + 2);
      const subtitleY = bottomY - subtitleHeight;

      ctx.fillStyle = this.overlayConfig.subtitleColor;
      ctx.font = `${this.typography.subtitleFontSize}px ${this.typography.fontFamily}`;
      this.drawMultilineText(
        ctx,
        subtitle,
        textX,
        subtitleY,
        textWidth,
        this.typography.subtitleFontSize,
        this.overlayConfig.subtitleMaxLines,
        this.typography.subtitleFontSize + 2,
      );

      bottomY = subtitleY - 4;
    }

    // Title
    const titleHeight = this.overlayConfig.titleMaxLines * this.typography.titleLineHeight;
    const titleY = bottomY - titleHeight;

    ctx.fillStyle = this.overlayConfig.textColor;
    ctx.font = `${this.typography.titleFontWeight} ${this.typography.titleFontSize}px ${this.typography.fontFamily}`;
    this.drawMultilineText(
      ctx,
      this.event.title,
      textX,
      titleY,
      textWidth,
      this.typography.titleFontSize,
      this.overlayConfig.titleMaxLines,
      this.typography.titleLineHeight,
    );
  }
}
