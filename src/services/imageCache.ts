// IndexedDB-based image cache for thumbnails (similar to Produktfinder)

const DB_NAME = 'KoralmbahnImageCache';
const DB_VERSION = 1;
const STORE_NAME = 'thumbnails';
const THUMBNAIL_SIZE = 256; // pixels

interface CachedImage {
  url: string;
  blob: Blob;
  timestamp: number;
}

class ImageCacheService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[ImageCache] Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  async get(url: string): Promise<HTMLImageElement | null> {
    await this.init();
    if (!this.db) return null;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(url);

      request.onsuccess = () => {
        const cached = request.result as CachedImage | undefined;
        if (cached) {
          // Convert blob to image
          const img = new Image();
          img.onload = () => {
            resolve(img);
          };
          img.onerror = () => {
            console.warn(`[ImageCache] Failed to load cached image: ${url}`);
            resolve(null);
          };
          img.src = URL.createObjectURL(cached.blob);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error('[ImageCache] Get error:', request.error);
        resolve(null);
      };
    });
  }

  async set(url: string, blob: Blob): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const cached: CachedImage = {
        url,
        blob,
        timestamp: Date.now(),
      };

      const request = store.put(cached);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        console.error('[ImageCache] Set error:', request.error);
        reject(request.error);
      };
    });
  }

  async fetchAndCache(originalUrl: string): Promise<HTMLImageElement | null> {
    // Try to get from cache first
    const cached = await this.get(originalUrl);
    if (cached) return cached;

    // Fetch thumbnail from Storage API with 256px width
    const thumbnailUrl = this.buildThumbnailUrl(originalUrl);

    try {
      const response = await fetch(thumbnailUrl);

      if (!response.ok) {
        console.warn(`[ImageCache] Fetch failed: ${response.status}`);
        return null;
      }

      const blob = await response.blob();

      // Cache the blob
      await this.set(originalUrl, blob);

      // Convert to image
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => {
          console.warn(`[ImageCache] Failed to load fetched image`);
          resolve(null);
        };
        img.src = URL.createObjectURL(blob);
      });
    } catch (error) {
      console.error('[ImageCache] Fetch error:', error);
      return null;
    }
  }

  private buildThumbnailUrl(url: string): string {
    // If URL already has parameters, respect them; only add missing thumbnail params
    try {
      const urlObj = new URL(url);

      // Only add width if not already present
      if (!urlObj.searchParams.has('width') && !urlObj.searchParams.has('height')) {
        urlObj.searchParams.set('width', String(THUMBNAIL_SIZE));
      }

      // Only add format if not already specified
      if (!urlObj.searchParams.has('format')) {
        urlObj.searchParams.set('format', 'jpg');
      }

      // Only add quality if not already specified
      if (!urlObj.searchParams.has('quality')) {
        urlObj.searchParams.set('quality', '85');
      }

      return urlObj.toString();
    } catch {
      // If URL is malformed, return as-is
      return url;
    }
  }

  async clear(): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        console.error('[ImageCache] Clear error:', request.error);
        reject(request.error);
      };
    });
  }

  async getStats(): Promise<{ count: number; totalSize: number }> {
    await this.init();
    if (!this.db) return { count: 0, totalSize: 0 };

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const items = request.result as CachedImage[];
        const count = items.length;
        const totalSize = items.reduce((sum, item) => sum + item.blob.size, 0);
        resolve({ count, totalSize });
      };

      request.onerror = () => {
        console.error('[ImageCache] Stats error:', request.error);
        resolve({ count: 0, totalSize: 0 });
      };
    });
  }
}

// Singleton instance
export const imageCache = new ImageCacheService();
