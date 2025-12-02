import { Configuration, EventsApi, type Event } from 'eventcrawler-api-sdk';
import type { KoralmEvent } from '../types/koralmbahn';

// Storage API configuration
const DEFAULT_STORAGE_BASE_URL = 'https://api-storage.arkturian.com';
const STORAGE_BASE_URL =
  (import.meta.env.VITE_KORALMBAHN_STORAGE_URL as string | undefined)?.replace(/\/+$/, '') ??
  DEFAULT_STORAGE_BASE_URL;

// Image source mode: storage, proxy, or local
type ImageSourceMode = 'storage' | 'proxy' | 'local';
const IMAGE_SOURCE: ImageSourceMode =
  (import.meta.env.VITE_IMAGE_SOURCE as ImageSourceMode) || 'storage';

const IMAGE_PROXY_URL = 'https://share.arkturian.com/imageproxy.php';

/**
 * Build a Storage API media URL with optional transformation params
 */
function buildStorageMediaUrl(
  id: string | number,
  params?: Record<string, string | number | undefined>
): string {
  const url = new URL(`${STORAGE_BASE_URL}/storage/media/${id}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * Wrap URL with image proxy if proxy mode is enabled
 */
function wrapWithProxy(url: string): string {
  if (IMAGE_SOURCE === 'proxy') {
    const proxyUrl = new URL(IMAGE_PROXY_URL);
    proxyUrl.searchParams.set('url', url);
    return proxyUrl.toString();
  }
  return url;
}

/**
 * Normalize text by stripping HTML and extra whitespace
 */
function normalizeSnippet(value?: string | null): string {
  if (!value) return '';
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve API base URL from environment
 */
function resolveApiBaseUrl(): string {
  const explicit = import.meta.env.VITE_KORALMBAHN_API_URL;
  if (explicit && explicit.length > 0) {
    return explicit.replace(/\/?$/, '');
  }

  if (import.meta.env.DEV) {
    return 'http://localhost:8081';
  }

  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }

  return '';
}

/**
 * Create configured EventsApi instance
 */
function createEventsApi(): EventsApi {
  const config = new Configuration({
    basePath: resolveApiBaseUrl()
  });
  return new EventsApi(config);
}

/**
 * Map SDK Event to KoralmEvent for UI consumption
 */
function mapEventToKoralmEvent(event: Event): KoralmEvent {
  const title = event.title_de?.trim() || event.title_en?.trim() || 'Unbetitelter Beitrag';
  const summary = normalizeSnippet(event.summary_de || event.summary_en);

  // Build image URLs from storage IDs
  let imageUrl: string | null = null;
  let screenshotUrl: string | null = null;
  let isImageScreenshot = false;

  if (event.hero_image_storage_id) {
    imageUrl = wrapWithProxy(buildStorageMediaUrl(event.hero_image_storage_id));
  }

  if (event.screenshot_storage_id) {
    screenshotUrl = wrapWithProxy(buildStorageMediaUrl(event.screenshot_storage_id));

    // If no hero image, use screenshot as main image
    if (!imageUrl) {
      imageUrl = screenshotUrl;
      isImageScreenshot = true;
      screenshotUrl = null;
    }
  }

  // Parse tags (stored as JSON string in v2 API)
  let category: string | null = null;
  if (event.tags) {
    try {
      const tagsArray = JSON.parse(event.tags);
      if (Array.isArray(tagsArray) && tagsArray.length > 0) {
        category = tagsArray[0];
      }
    } catch {
      // tags might be a plain string
      category = event.tags;
    }
  }

  return {
    id: event.id ? String(event.id) : event.event_uuid,
    title,
    subtitle: event.subtitle?.trim() || null,
    summary: summary.length > 200 ? summary.substring(0, 197) + '...' : summary,
    url: event.url || '#',
    imageUrl,
    screenshotUrl,
    isImageScreenshot,
    publishedAt: event.published_at || null,
    sourceName: null, // v2 doesn't include source_name in event response
    category,
    sentiment: event.sentiment ?? null,
  };
}

/**
 * Fetch events from EventCrawler v2 API using the SDK
 */
export async function fetchKoralmEvents(
  limit: number = 300
): Promise<KoralmEvent[]> {
  const api = createEventsApi();

  console.log('[KoralmAPI] Fetching events from:', resolveApiBaseUrl());

  try {
    const response = await api.listEventsApiV1EventsGet({ limit });
    const events = response.data;

    console.log(`[KoralmAPI] Loaded ${events.length} events`);

    return events.map(mapEventToKoralmEvent);
  } catch (error) {
    console.error('[KoralmAPI] Fetch failed:', error);
    return [];
  }
}
