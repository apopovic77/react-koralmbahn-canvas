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
   */
  render(context: CardRenderContext): void {
    const { ctx, x, y, width, height } = context;
    const { padding, qrCodeSize, qrCodePadding } = this.baseConfig;

    // Background
    this.renderCardBackground(context);

    // Calculate areas
    const imageHeight = Math.floor(height * this.titleConfig.imageRatio);
    const textAreaY = y + imageHeight;

    // Render image
    this.renderImage(context, imageHeight);

    // Text area
    const textX = x + padding;
    const textWidth = width - padding * 2;
    const textStartY = textAreaY + padding;

    // QR Code (top-right of text area)
    const qrX = x + width - qrCodeSize - qrCodePadding;
    const qrY = textAreaY + qrCodePadding;
    if (this.baseConfig.showQRCode) {
      this.drawQRCode(ctx, qrX, qrY, qrCodeSize);
    }

    // Title (with space for QR code)
    const titleWidth = this.baseConfig.showQRCode
      ? textWidth - qrCodeSize - qrCodePadding
      : textWidth;

    this.setTitleStyle(ctx);
    let currentY = this.drawMultilineText(
      ctx,
      this.event.title,
      textX,
      textStartY,
      titleWidth,
      this.typography.titleFontSize,
      this.titleConfig.titleMaxLines,
      this.typography.titleLineHeight,
    );

    // Subtitle (source name or subtitle)
    const subtitle = this.event.subtitle || this.event.sourceName;
    if (subtitle) {
      currentY += 4;
      this.setSubtitleStyle(ctx);
      this.drawMultilineText(
        ctx,
        subtitle,
        textX,
        currentY,
        textWidth,
        this.typography.subtitleFontSize,
        this.titleConfig.subtitleMaxLines,
        this.typography.subtitleFontSize + 2,
      );
    }
  }
}
