/**
 * FixedSizeCanvasCard - Abstract base for cards with configurable aspect ratio
 *
 * Extends BaseCanvasCard to add:
 * - Configurable aspect ratio (1:1, 4:3, 16:9, 3:4, etc.)
 * - Height calculation based on width and aspect ratio
 *
 * Concrete implementations:
 * - TitleCanvasCard: Image + Title/Subtitle (minimal text)
 * - SummaryCanvasCard: Image + Title + Summary (more text)
 * - OverlayCanvasCard: Fullsize image with text overlay
 */

import type { KoralmEvent } from '../../types/koralmbahn';
import {
  type AspectRatio,
  type BaseCardConfig,
  type TypographyConfig,
  type FixedSizeCardConfig,
  aspectRatioToNumber,
  DEFAULT_BASE_CONFIG,
} from './CardConfig';
import { BaseCanvasCard, type CardRenderContext } from './BaseCanvasCard';

/**
 * Default configuration for fixed-size cards
 */
export const DEFAULT_FIXED_SIZE_CONFIG: FixedSizeCardConfig = {
  ...DEFAULT_BASE_CONFIG,
  aspectRatio: '4:3',
};

/**
 * Abstract base class for fixed aspect ratio cards
 */
export abstract class FixedSizeCanvasCard extends BaseCanvasCard {
  /** Aspect ratio configuration */
  protected readonly aspectRatio: AspectRatio;

  constructor(
    event: KoralmEvent,
    aspectRatio: AspectRatio = '4:3',
    baseConfig: Partial<BaseCardConfig> = {},
    typography: Partial<TypographyConfig> = {},
  ) {
    super(event, baseConfig, typography);
    this.aspectRatio = aspectRatio;
  }

  /**
   * Get the aspect ratio as a number (width / height)
   */
  getAspectRatioValue(): number {
    return aspectRatioToNumber(this.aspectRatio);
  }

  /**
   * Get the aspect ratio string
   */
  getAspectRatio(): AspectRatio {
    return this.aspectRatio;
  }

  /**
   * Calculate card height based on width and aspect ratio
   */
  calculateHeight(width: number): number {
    return width / this.getAspectRatioValue();
  }

  /**
   * Render the card background (shadow + border)
   */
  protected renderCardBackground(context: CardRenderContext): void {
    const { ctx, x, y, width, height } = context;
    this.drawShadow(ctx, x, y, width, height);
    this.drawBorder(ctx, x, y, width, height);
  }

  /**
   * Render the image area with placeholder fallback
   */
  protected renderImage(
    context: CardRenderContext,
    imageHeight: number,
  ): void {
    const { ctx, x, y, width, image } = context;

    if (image && image.complete) {
      this.drawImageCover(ctx, image, x, y, width, imageHeight, this.isScreenshot());
    } else {
      this.drawImagePlaceholder(ctx, x, y, width, imageHeight);
    }

    // Debug ID overlay
    this.drawDebugId(ctx, x, y);
  }
}
