/**
 * CardFactory - Factory for creating canvas card instances
 *
 * Provides a centralized way to create card instances based on:
 * - Card style type (title, summary, overlay)
 * - Aspect ratio configuration
 * - Custom configuration overrides
 *
 * Usage:
 * ```typescript
 * const factory = new CardFactory({ aspectRatio: '4:3' });
 * const card = factory.createCard(event, 'title');
 * card.render(context);
 * ```
 */

import type { KoralmEvent } from '../../types/koralmbahn';
import type { AspectRatio, BaseCardConfig, TypographyConfig, CardStyleType } from './CardConfig';
import { BaseCanvasCard } from './BaseCanvasCard';
import { TitleCanvasCard, type TitleCardConfig } from './TitleCanvasCard';
import { SummaryCanvasCard, type SummaryCardConfig } from './SummaryCanvasCard';
import { OverlayCanvasCard, type OverlayCardConfig } from './OverlayCanvasCard';

/**
 * Factory configuration
 */
export interface CardFactoryConfig {
  /** Default aspect ratio for all cards */
  aspectRatio: AspectRatio;

  /** Default card style */
  defaultStyle: CardStyleType;

  /** Base configuration overrides */
  baseConfig?: Partial<BaseCardConfig>;

  /** Typography overrides */
  typography?: Partial<TypographyConfig>;

  /** Title card specific config */
  titleConfig?: Partial<TitleCardConfig>;

  /** Summary card specific config */
  summaryConfig?: Partial<SummaryCardConfig>;

  /** Overlay card specific config */
  overlayConfig?: Partial<OverlayCardConfig>;
}

const DEFAULT_FACTORY_CONFIG: CardFactoryConfig = {
  aspectRatio: '4:3',
  defaultStyle: 'summary',
};

/**
 * Factory for creating card instances
 */
export class CardFactory {
  private readonly config: CardFactoryConfig;

  constructor(config: Partial<CardFactoryConfig> = {}) {
    this.config = { ...DEFAULT_FACTORY_CONFIG, ...config };
  }

  /**
   * Create a card instance for the given event
   *
   * @param event - The event data to render
   * @param style - Card style (optional, uses default if not specified)
   * @param aspectRatioOverride - Override the default aspect ratio
   */
  createCard(
    event: KoralmEvent,
    style?: CardStyleType,
    aspectRatioOverride?: AspectRatio,
  ): BaseCanvasCard {
    const cardStyle = style || this.getStyleFromEvent(event) || this.config.defaultStyle;
    const aspectRatio = aspectRatioOverride || this.config.aspectRatio;

    switch (cardStyle) {
      case 'title':
        return new TitleCanvasCard(
          event,
          aspectRatio,
          this.config.titleConfig,
          this.config.baseConfig,
          this.config.typography,
        );

      case 'summary':
        return new SummaryCanvasCard(
          event,
          aspectRatio,
          this.config.summaryConfig,
          this.config.baseConfig,
          this.config.typography,
        );

      case 'overlay':
      case 'imageOnly':
        return new OverlayCanvasCard(
          event,
          aspectRatio,
          this.config.overlayConfig,
          this.config.baseConfig,
          this.config.typography,
        );

      default:
        // Default to summary card
        return new SummaryCanvasCard(
          event,
          aspectRatio,
          this.config.summaryConfig,
          this.config.baseConfig,
          this.config.typography,
        );
    }
  }

  /**
   * Get card style from event's cardStyle property
   */
  private getStyleFromEvent(event: KoralmEvent): CardStyleType | null {
    if (!event.cardStyle) return null;

    // Map old card styles to new ones
    switch (event.cardStyle) {
      case 'standard':
        return 'summary';
      case 'catalog':
        return 'summary';
      case 'imageOnly':
        return 'overlay';
      default:
        return event.cardStyle as CardStyleType;
    }
  }

  /**
   * Get the configured aspect ratio
   */
  getAspectRatio(): AspectRatio {
    return this.config.aspectRatio;
  }

  /**
   * Get the default card style
   */
  getDefaultStyle(): CardStyleType {
    return this.config.defaultStyle;
  }

  /**
   * Create a new factory with updated configuration
   */
  withConfig(config: Partial<CardFactoryConfig>): CardFactory {
    return new CardFactory({ ...this.config, ...config });
  }

  /**
   * Create a new factory with a different aspect ratio
   */
  withAspectRatio(aspectRatio: AspectRatio): CardFactory {
    return this.withConfig({ aspectRatio });
  }

  /**
   * Create a new factory with a different default style
   */
  withDefaultStyle(style: CardStyleType): CardFactory {
    return this.withConfig({ defaultStyle: style });
  }
}

/**
 * Default factory instance with standard configuration
 */
export const defaultCardFactory = new CardFactory();

/**
 * Preset factories for common use cases
 */
export const CardFactoryPresets = {
  /** 4:3 cards with title only */
  title4x3: new CardFactory({
    aspectRatio: '4:3',
    defaultStyle: 'title',
  }),

  /** 3:4 portrait cards with summary */
  summary3x4: new CardFactory({
    aspectRatio: '3:4',
    defaultStyle: 'summary',
  }),

  /** 16:9 wide cards with overlay */
  overlay16x9: new CardFactory({
    aspectRatio: '16:9',
    defaultStyle: 'overlay',
  }),

  /** Square cards with overlay */
  overlaySquare: new CardFactory({
    aspectRatio: '1:1',
    defaultStyle: 'overlay',
  }),

  /** 5:7 portrait cards (like photos) */
  photo5x7: new CardFactory({
    aspectRatio: '5:7',
    defaultStyle: 'title',
  }),
};
