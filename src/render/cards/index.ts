/**
 * Canvas Cards Module
 *
 * Clean OOP architecture for rendering event cards on HTML5 Canvas.
 *
 * Class Hierarchy:
 * ```
 * BaseCanvasCard (abstract)
 * └── FixedSizeCanvasCard (abstract, adds aspect ratio)
 *     ├── TitleCanvasCard      - Image + Title/Subtitle (minimal text)
 *     ├── SummaryCanvasCard    - Image + Title + Summary (more text)
 *     └── OverlayCanvasCard    - Fullsize image + text overlay
 * ```
 *
 * Usage:
 * ```typescript
 * import { CardFactory, CardFactoryPresets } from './cards';
 *
 * // Create a factory with configuration
 * const factory = new CardFactory({
 *   aspectRatio: '4:3',
 *   defaultStyle: 'summary',
 * });
 *
 * // Or use a preset
 * const factory = CardFactoryPresets.title4x3;
 *
 * // Create and render cards
 * const card = factory.createCard(event);
 * card.render({ ctx, x, y, width, height, image });
 * ```
 */

// Configuration types
export {
  type AspectRatio,
  type CardStyleType,
  type BaseCardConfig,
  type FixedSizeCardConfig,
  type ImageTextCardConfig,
  type OverlayCardConfig as OverlayCardConfigBase,
  type TypographyConfig,
  aspectRatioToNumber,
  calculateCardHeight,
  DEFAULT_BASE_CONFIG,
  DEFAULT_TYPOGRAPHY,
  DEFAULT_OVERLAY_CONFIG,
} from './CardConfig';

// Base classes
export { BaseCanvasCard, type CardRenderContext } from './BaseCanvasCard';
export { FixedSizeCanvasCard } from './FixedSizeCanvasCard';

// Concrete card implementations
export { TitleCanvasCard, type TitleCardConfig } from './TitleCanvasCard';
export { SummaryCanvasCard, type SummaryCardConfig } from './SummaryCanvasCard';
export { OverlayCanvasCard, type OverlayCardConfig } from './OverlayCanvasCard';

// Factory
export {
  CardFactory,
  type CardFactoryConfig,
  defaultCardFactory,
  CardFactoryPresets,
} from './CardFactory';
