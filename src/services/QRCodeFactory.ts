import QRCode from 'qrcode';

export interface QRCodeOptions {
  width?: number;
  margin?: number;
  color?: {
    dark: string;
    light: string;
  };
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

/**
 * Factory class for generating QR codes.
 * Provides centralized logic for QR code generation to ensure consistency and avoid duplication.
 */
export class QRCodeFactory {
  private static readonly DEFAULT_OPTIONS: QRCodeOptions = {
    width: 128,
    margin: 1,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'M',
  };

  /**
   * Generates a Data URL (Base64) for the given text/URL.
   * @param text The content to encode in the QR code.
   * @param options Optional configuration overrides.
   * @returns Promise resolving to the Data URL string.
   */
  public static async generateDataUrl(text: string, options?: Partial<QRCodeOptions>): Promise<string> {
    const mergedOptions = { ...this.DEFAULT_OPTIONS, ...options };
    try {
      return await QRCode.toDataURL(text, mergedOptions);
    } catch (error) {
      console.error('[QRCodeFactory] Failed to generate Data URL:', error);
      throw error;
    }
  }

  /**
   * Generates an HTMLImageElement with the QR code.
   * Useful for Canvas rendering where an Image object is required.
   * @param text The content to encode.
   * @param options Optional configuration overrides.
   * @returns Promise resolving to a loaded HTMLImageElement.
   */
  public static async generateImage(text: string, options?: Partial<QRCodeOptions>): Promise<HTMLImageElement> {
    const dataUrl = await this.generateDataUrl(text, options);
    
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (err) => {
        console.error('[QRCodeFactory] Failed to load image from Data URL:', err);
        reject(err);
      };
      img.src = dataUrl;
    });
  }
}

