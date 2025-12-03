/**
 * TitleCanvasCard - Minimal text card with image + title/subtitle
 *
 * Layout:
 * ┌─────────────────────┐
 * │                     │
 * │      HERO IMAGE     │  ~75% height
 * │                     │
 * ├─────────────────────┤
 * │ Title          [QR] │  ~25% height
 * │ Subtitle            │
 * └─────────────────────┘
 *
 * Use case: Clean, image-focused cards with minimal text
 */

import type { KoralmEvent } from '../../types/koralmbahn';
import type { AspectRatio, BaseCardConfig, TypographyConfig } from './CardConfig';
import { FixedSizeCanvasCard } from './FixedSizeCanvasCard';
import type { CardRenderContext } from './BaseCanvasCard';

/**
 * Configuration specific to TitleCanvasCard
 */
export interface TitleCardConfig {
  /** Ratio of card height for image (0.0 - 1.0), default 0.75 */
  imageRatio: number;

  /** Maximum lines for title, default 2 */
  titleMaxLines: number;

  /** Maximum lines for subtitle, default 1 */
  subtitleMaxLines: number;
}

const DEFAULT_TITLE_CARD_CONFIG: TitleCardConfig = {
  imageRatio: 0.75,
  titleMaxLines: 2,
  subtitleMaxLines: 1,
};

/**
 * Card with hero image and minimal text (title + subtitle only)
 */
export class TitleCanvasCard extends FixedSizeCanvasCard {
  private readonly titleConfig: TitleCardConfig;

  constructor(
    event: KoralmEvent,
    aspectRatio: AspectRatio = '4:3',
    titleConfig: Partial<TitleCardConfig> = {},
    baseConfig: Partial<BaseCardConfig> = {},
    typography: Partial<TypographyConfig> = {},
  ) {
    super(event, aspectRatio, baseConfig, typography);
    this.titleConfig = { ...DEFAULT_TITLE_CARD_CONFIG, ...titleConfig };
  }

  /**
   * Get the image ratio
   */
  getImageRatio(): number {
    return this.titleConfig.imageRatio;
  }

  /**
   * Render the card
   *
   * When LOD textOpacity is low (card is small), renders image-only mode
   * for better performance and readability. Text fades in smoothly when
   * transitioning back to detail mode.
   */
  render(context: CardRenderContext): void {
    const { ctx, x, y, width, height, image, lodState } = context;
    const { padding, qrCodeSize, qrCodePadding } = this.baseConfig;

    // LOD: Image-only mode when card is too small for text
    const textOpacity = lodState?.textOpacity ?? 1;
    const isImageOnlyMode = textOpacity < 0.1;
    const isTransitioning = textOpacity >= 0.1 && textOpacity < 1.0;

    if (isImageOnlyMode) {
      // Render fullscreen image only (no text, no QR code)
      this.renderCardBackground(context);
      if (image && image.complete) {
        this.drawImageCover(ctx, image, x, y, width, height, this.isScreenshot());
      } else {
        this.drawImagePlaceholder(ctx, x, y, width, height);
      }
      return;
    }

    // Background
    this.renderCardBackground(context);

    // During fade-in transition, draw fullscreen image underneath
    if (isTransitioning) {
      if (image && image.complete) {
        this.drawImageCover(ctx, image, x, y, width, height, this.isScreenshot());
      } else {
        this.drawImagePlaceholder(ctx, x, y, width, height);
      }
    }

    // Calculate areas
    const imageHeight = Math.floor(height * this.titleConfig.imageRatio);
    const textAreaY = y + imageHeight;

    // Render image (with fade during transition)
    if (isTransitioning) {
      ctx.save();
      ctx.globalAlpha = textOpacity;
    }
    this.renderImage(context, imageHeight);

    // Text area background (white) - needs to fade in
    ctx.fillStyle = this.baseConfig.backgroundColor;
    ctx.fillRect(x, textAreaY, width, height - imageHeight);

    // Text area
    const textX = x + padding;
    const textWidth = width - padding * 2;
    let currentY = textAreaY + padding;

    // QR Code (top-right of text area)
    const qrX = x + width - qrCodeSize - qrCodePadding;
    const qrY = textAreaY + qrCodePadding;
    if (this.baseConfig.showQRCode) {
      this.drawQRCode(ctx, qrX, qrY, qrCodeSize);
    }

    // Available width for text (accounting for QR code)
    const titleWidth = this.baseConfig.showQRCode
      ? textWidth - qrCodeSize - qrCodePadding
      : textWidth;

    // Source/Publisher (above title)
    if (this.event.sourceName) {
      this.setSubtitleStyle(ctx);
      currentY = this.drawMultilineText(
        ctx,
        this.event.sourceName.toUpperCase(),
        textX,
        currentY,
        titleWidth,
        this.typography.subtitleFontSize - 1,
        1, // Single line
        this.typography.subtitleFontSize,
      );
      currentY += 2;
    }

    // Title
    this.setTitleStyle(ctx);
    currentY = this.drawMultilineText(
      ctx,
      this.event.title,
      textX,
      currentY,
      titleWidth,
      this.typography.titleFontSize,
      this.titleConfig.titleMaxLines,
      this.typography.titleLineHeight,
    );

    // Subtitle (if different from source)
    if (this.event.subtitle) {
      currentY += 4;
      this.setSubtitleStyle(ctx);
      this.drawMultilineText(
        ctx,
        this.event.subtitle,
        textX,
        currentY,
        textWidth,
        this.typography.subtitleFontSize,
        this.titleConfig.subtitleMaxLines,
        this.typography.subtitleFontSize + 2,
      );
    }

    // Restore alpha if we were transitioning
    if (isTransitioning) {
      ctx.restore();
    }
  }
}
