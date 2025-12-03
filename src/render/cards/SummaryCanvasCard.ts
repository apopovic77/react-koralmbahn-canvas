/**
 * SummaryCanvasCard - Card with image + title + summary text
 *
 * Layout:
 * ┌─────────────────────┐
 * │                     │
 * │      HERO IMAGE     │  ~60% height
 * │                     │
 * ├─────────────────────┤
 * │ Title          [QR] │
 * │ Subtitle            │  ~40% height
 * │ Summary text that   │
 * │ can span multiple   │
 * │ lines...            │
 * └─────────────────────┘
 *
 * Use case: News/article cards with more content preview
 */

import type { KoralmEvent } from '../../types/koralmbahn';
import type { AspectRatio, BaseCardConfig, TypographyConfig } from './CardConfig';
import { FixedSizeCanvasCard } from './FixedSizeCanvasCard';
import type { CardRenderContext } from './BaseCanvasCard';

/**
 * Configuration specific to SummaryCanvasCard
 */
export interface SummaryCardConfig {
  /** Ratio of card height for image (0.0 - 1.0), default 0.60 */
  imageRatio: number;

  /** Maximum lines for title, default 2 */
  titleMaxLines: number;

  /** Maximum lines for subtitle, default 1 */
  subtitleMaxLines: number;

  /** Maximum lines for summary, default 4 */
  summaryMaxLines: number;

  /** Show ellipsis when summary is truncated */
  summaryEllipsis: boolean;
}

const DEFAULT_SUMMARY_CARD_CONFIG: SummaryCardConfig = {
  imageRatio: 0.60,
  titleMaxLines: 2,
  subtitleMaxLines: 1,
  summaryMaxLines: 4,
  summaryEllipsis: true,
};

/**
 * Card with hero image and extended text (title + subtitle + summary)
 */
export class SummaryCanvasCard extends FixedSizeCanvasCard {
  private readonly summaryConfig: SummaryCardConfig;

  constructor(
    event: KoralmEvent,
    aspectRatio: AspectRatio = '3:4',
    summaryConfig: Partial<SummaryCardConfig> = {},
    baseConfig: Partial<BaseCardConfig> = {},
    typography: Partial<TypographyConfig> = {},
  ) {
    super(event, aspectRatio, baseConfig, typography);
    this.summaryConfig = { ...DEFAULT_SUMMARY_CARD_CONFIG, ...summaryConfig };
  }

  /**
   * Get the image ratio
   */
  getImageRatio(): number {
    return this.summaryConfig.imageRatio;
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
    const imageHeight = Math.floor(height * this.summaryConfig.imageRatio);
    const textAreaY = y + imageHeight;

    // Render image (with fade during transition)
    if (isTransitioning) {
      // Image already drawn fullscreen above, now draw partial with opacity
      ctx.save();
      ctx.globalAlpha = textOpacity;
    }
    this.renderImage(context, imageHeight);

    // Text area background (white) - needs to fade in
    ctx.fillStyle = this.baseConfig.backgroundColor;
    ctx.fillRect(x, textAreaY, width, height - imageHeight);

    // Text area setup
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
      this.summaryConfig.titleMaxLines,
      this.typography.titleLineHeight,
    );

    // Subtitle (if different from source)
    if (this.event.subtitle) {
      currentY += 4;
      this.setSubtitleStyle(ctx);
      currentY = this.drawMultilineText(
        ctx,
        this.event.subtitle,
        textX,
        currentY,
        textWidth,
        this.typography.subtitleFontSize,
        this.summaryConfig.subtitleMaxLines,
        this.typography.subtitleFontSize + 2,
      );
    }

    // Summary
    if (this.event.summary) {
      currentY += 6;
      this.setSummaryStyle(ctx);
      this.drawMultilineText(
        ctx,
        this.event.summary,
        textX,
        currentY,
        textWidth,
        this.typography.summaryFontSize,
        this.summaryConfig.summaryMaxLines,
        this.typography.summaryLineHeight,
        this.summaryConfig.summaryEllipsis,
      );
    }

    // Restore alpha if we were transitioning
    if (isTransitioning) {
      ctx.restore();
    }
  }
}
