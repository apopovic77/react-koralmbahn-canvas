import { useImageCache as useEngineImageCache } from 'arkturian-canvas-engine';
import { imageCache } from '../services/imageCache';
import type { KoralmEvent } from '../types/koralmbahn';

/**
 * Project-specific wrapper around the generic useImageCache hook from arkturian-canvas-engine
 * Adds Koralmbahn-specific preloadImages functionality
 */
export function useImageCache() {
  // Use the generic hook from the engine
  const { setLowResImage, ...engineCache } = useEngineImageCache();

  const preloadImages = async (events: KoralmEvent[]): Promise<void> => {
    const promises = events.map(async (event) => {
      // Preload low-res event image (256px) from IndexedDB or fetch
      if (event.imageUrl) {
        try {
          const img = await imageCache.fetchAndCache(event.imageUrl);
          if (img) {
            setLowResImage(event.imageUrl, img);
          }
        } catch (error) {
          console.error(`[ImageCache] Failed to load low-res image for event ${event.id}:`, error);
        }
      }
    });

    await Promise.all(promises);
  };

  return {
    ...engineCache,
    setLowResImage,
    preloadImages,
  };
}
