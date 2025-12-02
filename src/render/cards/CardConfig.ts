/**
 * Card Configuration Types
 *
 * Defines all configuration options for canvas cards including
 * aspect ratios, text layouts, and visual styling.
 */

/**
 * Available aspect ratios for fixed-size cards
 */
export type AspectRatio = '1:1' | '4:3' | '3:2' | '16:9' | '3:4' | '2:3' | '5:7' | '9:16';

/**
 * Card style variants
 */
export type CardStyleType = 'title' | 'summary' | 'overlay' | 'imageOnly' | 'catalog';

/**
 * Convert aspect ratio string to numeric value
 */
export function aspectRatioToNumber(ratio: AspectRatio): number {
  const ratios: Record<AspectRatio, number> = {
    '1:1': 1,
    '4:3': 4 / 3,
    '3:2': 3 / 2,
    '16:9': 16 / 9,
    '3:4': 3 / 4,
    '2:3': 2 / 3,
    '5:7': 5 / 7,
    '9:16': 9 / 16,
  };
  return ratios[ratio];
}

/**
 * Calculate card height from width and aspect ratio
 */
export function calculateCardHeight(width: number, aspectRatio: AspectRatio): number {
  return width / aspectRatioToNumber(aspectRatio);
}

/**
 * Base configuration for all cards
 */
export interface BaseCardConfig {
  /** Padding inside the card (pixels) */
  padding: number;

  /** Show QR code on the card */
  showQRCode: boolean;

  /** QR code size (pixels) */
  qrCodeSize: number;

  /** QR code padding from card edges */
  qrCodePadding: number;

  /** Card border radius (pixels) */
  borderRadius: number;

  /** Shadow blur radius */
  shadowBlur: number;

  /** Shadow color */
  shadowColor: string;

  /** Border color */
  borderColor: string;

  /** Background color */
  backgroundColor: string;
}

/**
 * Configuration for fixed-size cards
 */
export interface FixedSizeCardConfig extends BaseCardConfig {
  /** Aspect ratio of the card */
  aspectRatio: AspectRatio;
}

/**
 * Configuration for cards with separate image and text areas
 */
export interface ImageTextCardConfig extends FixedSizeCardConfig {
  /** Percentage of card height for image (0.0 - 1.0) */
  imageRatio: number;
}

/**
 * Configuration for overlay cards (text over image)
 */
export interface OverlayCardConfig extends FixedSizeCardConfig {
  /** Gradient overlay height as percentage of card (0.0 - 1.0) */
  gradientHeight: number;

  /** Gradient start color (transparent) */
  gradientStartColor: string;

  /** Gradient end color (dark for readability) */
  gradientEndColor: string;

  /** Text color for overlay */
  textColor: string;
}

/**
 * Typography configuration
 */
export interface TypographyConfig {
  /** Font family */
  fontFamily: string;

  /** Title font size */
  titleFontSize: number;

  /** Title font weight */
  titleFontWeight: string;

  /** Title line height */
  titleLineHeight: number;

  /** Title color */
  titleColor: string;

  /** Subtitle font size */
  subtitleFontSize: number;

  /** Subtitle color */
  subtitleColor: string;

  /** Summary font size */
  summaryFontSize: number;

  /** Summary color */
  summaryColor: string;

  /** Summary line height */
  summaryLineHeight: number;
}

/**
 * Default base configuration
 */
export const DEFAULT_BASE_CONFIG: BaseCardConfig = {
  padding: 12,
  showQRCode: true,
  qrCodeSize: 40,
  qrCodePadding: 10,
  borderRadius: 0,
  shadowBlur: 10,
  shadowColor: 'rgba(0, 0, 0, 0.1)',
  borderColor: '#e0e0e0',
  backgroundColor: '#ffffff',
};

/**
 * Default typography configuration
 */
export const DEFAULT_TYPOGRAPHY: TypographyConfig = {
  fontFamily: '"Bricolage Grotesque", sans-serif',
  titleFontSize: 12,
  titleFontWeight: 'bold',
  titleLineHeight: 14,
  titleColor: '#1a1a1a',
  subtitleFontSize: 10,
  subtitleColor: '#666666',
  summaryFontSize: 10,
  summaryColor: '#555555',
  summaryLineHeight: 12,
};

/**
 * Default overlay configuration
 */
export const DEFAULT_OVERLAY_CONFIG: Omit<OverlayCardConfig, keyof FixedSizeCardConfig> = {
  gradientHeight: 0.5,
  gradientStartColor: 'rgba(0, 0, 0, 0)',
  gradientEndColor: 'rgba(0, 0, 0, 0.8)',
  textColor: '#ffffff',
};
