import type { Event } from 'eventcrawler-api-sdk';
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
    return 'http://localhost:8082'; // eventcrawler-v2 default port
  }

  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }

  return '';
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

  // Check if user prefers screenshot over hero image
  const eventAnyForPrefer = event as Event & { prefer_screenshot?: boolean };
  const preferScreenshot = eventAnyForPrefer.prefer_screenshot === true;

  const heroUrl = event.hero_image_storage_id
    ? wrapWithProxy(buildStorageMediaUrl(event.hero_image_storage_id))
    : null;

  const screenshotUrlBuilt = event.screenshot_storage_id
    ? wrapWithProxy(buildStorageMediaUrl(event.screenshot_storage_id))
    : null;

  if (preferScreenshot && screenshotUrlBuilt) {
    // User prefers screenshot - use it as main image
    imageUrl = screenshotUrlBuilt;
    isImageScreenshot = true;
    screenshotUrl = heroUrl; // Show hero below if exists
  } else if (heroUrl) {
    // Normal case: hero image is primary
    imageUrl = heroUrl;
    screenshotUrl = screenshotUrlBuilt;
  } else if (screenshotUrlBuilt) {
    // No hero image - use screenshot as main image
    imageUrl = screenshotUrlBuilt;
    isImageScreenshot = true;
    screenshotUrl = null;
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

  // Some fields may not be in the SDK type but are returned by the API
  const eventAny = event as Event & { source_name?: string | null };

  return {
    id: event.id ? String(event.id) : event.event_uuid,
    title,
    subtitle: event.subtitle?.trim() || null,
    summary: summary.length > 200 ? summary.substring(0, 197) + '...' : summary,
    markdownBody: event.markdown_body || null,
    url: event.url || '#',
    imageUrl,
    screenshotUrl,
    isImageScreenshot,
    preferScreenshot,
    publishedAt: event.published_at || null,
    sourceName: eventAny.source_name || null,
    category,
    sentiment: event.sentiment ?? null,
  };
}

/**
 * Project info from API
 */
export interface ProjectInfo {
  id: number;
  slug: string;
  name: string;
}

/**
 * Kiosk settings from server
 */
export interface KioskSettings {
  articleDuration: number;
  overviewDuration: number;
  transitionDuration: number;
  pollingInterval: number;
  imageLodThreshold: number;  // Zoom level at which high-res images are loaded (e.g., 1.5 = 150%)
  detailLodThreshold: number; // Card width in pixels at which text/QR becomes visible
  kioskMode: 'chronological' | 'random';
}

/**
 * Default kiosk settings (matches server defaults)
 */
export const DEFAULT_KIOSK_SETTINGS: KioskSettings = {
  articleDuration: 30.0,
  overviewDuration: 15.0,
  transitionDuration: 2.0,
  pollingInterval: 30.0,
  imageLodThreshold: 1.5,
  detailLodThreshold: 180.0,
  kioskMode: 'chronological',
};

/**
 * Fetch kiosk settings from server
 */
export async function fetchKioskSettings(): Promise<KioskSettings> {
  const baseUrl = resolveApiBaseUrl();
  const url = `${baseUrl}/api/v1/debug/kiosk/settings`;

  console.log('[KoralmAPI] Fetching kiosk settings from:', url);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    console.log('[KoralmAPI] Loaded kiosk settings:', data);
    return data as KioskSettings;
  } catch (error) {
    console.error('[KoralmAPI] Failed to fetch kiosk settings:', error);
    return DEFAULT_KIOSK_SETTINGS;
  }
}

/**
 * Fetch available projects from API
 */
export async function fetchProjects(): Promise<ProjectInfo[]> {
  const baseUrl = resolveApiBaseUrl();
  const url = `${baseUrl}/api/v1/projects/`;

  console.log('[KoralmAPI] Fetching projects from:', url);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    console.log('[KoralmAPI] Loaded projects:', data);
    return data as ProjectInfo[];
  } catch (error) {
    console.error('[KoralmAPI] Failed to fetch projects:', error);
    // Return default projects as fallback
    return [
      { id: 1, slug: 'koralmbahn', name: 'Koralmbahn' },
    ];
  }
}

/**
 * Fetch events from EventCrawler v2 API
 * Uses direct fetch instead of SDK to support project_slug parameter
 * @param limit Maximum number of events to fetch
 * @param projectSlug Optional project slug to filter by (e.g., 'default', 'tscheppaschlucht')
 */
export async function fetchKoralmEvents(
  limit: number = 300,
  projectSlug?: string
): Promise<KoralmEvent[]> {
  const baseUrl = resolveApiBaseUrl();
  const logPrefix = projectSlug ? `[KoralmAPI:${projectSlug}]` : '[KoralmAPI]';

  // Build URL with query parameters (trailing slash to avoid 307 redirect)
  const url = new URL(`${baseUrl}/api/v1/events/`);
  url.searchParams.set('limit', String(limit));
  if (projectSlug) {
    url.searchParams.set('project_slug', projectSlug);
  }

  console.log(`${logPrefix} Fetching events from:`, url.toString());

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const events = await response.json() as Event[];

    console.log(`${logPrefix} Loaded ${events.length} events`);

    return events.map(mapEventToKoralmEvent);
  } catch (error) {
    console.error(`${logPrefix} Fetch failed:`, error);
    return [];
  }
}
