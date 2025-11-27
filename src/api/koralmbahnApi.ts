import type { KoralmEvent } from '../types/koralmbahn';

const DEFAULT_STORAGE_BASE_URL = 'https://api-storage.arkserver.arkturian.com';
const STORAGE_BASE_URL =
  (import.meta.env.VITE_KORALMBAHN_STORAGE_URL as string | undefined)?.replace(/\/+$/, '') ??
  DEFAULT_STORAGE_BASE_URL;

const STORAGE_HOSTNAME = (() => {
  try {
    return new URL(`${STORAGE_BASE_URL}/`).hostname;
  } catch {
    return undefined;
  }
})();

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

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ');
}

function normalizeSnippet(value?: string | null): string {
  if (!value) return '';
  return stripHtml(value)
    .replace(/\s+/g, ' ')
    .trim();
}


function resolveApiBaseUrl(): string {
  // Check for explicit API URL
  const explicit = import.meta.env.VITE_KORALMBAHN_API_URL;
  if (explicit && explicit.length > 0) {
    return explicit.replace(/\/?$/, '');
  }

  // Development: local API
  if (import.meta.env.DEV) {
    return 'http://localhost:8080';
  }

  // Production: arkserver API
  return 'http://arkserver.arkturian.com:8081';
}

interface EventApiResponse {
  event_id?: number | null;
  event_uuid?: string | null;
  title_de?: string | null;
  title_en?: string | null;
  subtitle?: string | null;
  summary_de?: string | null;
  summary_en?: string | null;
  url?: string | null;
  published_at?: string | null;
  sentiment?: number | null;
  source_name?: string | null;
  tags?: string[] | null;
  media?: Array<{
    id?: string | null;
    type?: string | null;
    url?: string | null;
    thumbnail_url?: string | null;
    source_url?: string | null;
    source_name?: string | null;
    media_role?: string | null;
    storage_object?: {
      id?: number | string | null;
      mime_type?: string | null;
    } | null;
  }> | null;
}

function mapEventToKoralmEvent(event: EventApiResponse): KoralmEvent {
  // Prefer German content
  const title = event.title_de?.trim() || event.title_en?.trim() || 'Unbetitelter Beitrag';
  const summary = normalizeSnippet(event.summary_de || event.summary_en);

  // Helper to check if a media item is a screenshot
  const isScreenshotMedia = (media: NonNullable<EventApiResponse['media']>[0]): boolean => {
    const sourceName = media.source_name?.toLowerCase() || '';
    return !!(
      media.media_role === 'screenshot' ||
      sourceName.includes('screenshot') ||
      media.url?.includes('#screenshot') ||
      media.url?.toLowerCase().includes('playwright') ||
      media.url?.toLowerCase().includes('screenshot')
    );
  };

  // Helper to build media URL
  const buildMediaUrl = (media: NonNullable<EventApiResponse['media']>[0]): string | null => {
    const storageHost = STORAGE_HOSTNAME;
    const isStorageUrl = (() => {
      if (!media?.url) return false;
      try {
        const host = new URL(media.url).hostname;
        return storageHost ? host === storageHost : media.url.includes('/storage/media/');
      } catch {
        return media.url.includes('/storage/media/');
      }
    })();

    if (isStorageUrl && media?.url) {
      return media.url;
    } else if (media?.id || media?.storage_object?.id) {
      const storageId = media.id || media.storage_object?.id;
      const mimeType = media.storage_object?.mime_type;
      const isSvg = mimeType?.toLowerCase().includes('svg');
      const params: Record<string, string | number> = {};

      if (isSvg) {
        params.format = 'png';
        params.aspect_ratio = '5:7';
      }

      return buildStorageMediaUrl(storageId!, params);
    }
    return null;
  };

  // Extract both hero image and screenshot URLs
  let imageUrl: string | null = null;
  let screenshotUrl: string | null = null;

  if (event.media && event.media.length > 0) {
    // Find first non-screenshot (hero image)
    const heroMedia = event.media.find(m => !isScreenshotMedia(m));
    // Find first screenshot
    const screenshotMedia = event.media.find(m => isScreenshotMedia(m));

    imageUrl = heroMedia ? buildMediaUrl(heroMedia) : buildMediaUrl(event.media[0]);
    screenshotUrl = screenshotMedia ? buildMediaUrl(screenshotMedia) : null;
  }

  // Determine if the final imageUrl is a screenshot
  // It is a screenshot if:
  // 1. We have media
  // 2. We didn't find a heroMedia (non-screenshot)
  // 3. So we fell back to event.media[0] which MUST be a screenshot (otherwise it would be heroMedia)
  // OR if the explicit logic says so.
  let isImageScreenshot = false;
  if (event.media && event.media.length > 0) {
    const heroMedia = event.media.find(m => !isScreenshotMedia(m));
    if (!heroMedia) {
        isImageScreenshot = true;
    }
  }

  // DEBUG: Log screenshot detection
  const hasScreenshot = !!screenshotUrl;
  if (hasScreenshot || event.media?.some(m => isScreenshotMedia(m))) {
    console.log('[API Debug] Event with screenshot:', {
      title: title.substring(0, 50),
      imageUrl,
      screenshotUrl,
      sourceName: event.media?.[0]?.source_name,
      allMedia: event.media?.map(m => ({
        source_name: m.source_name,
        url: m.url?.substring(0, 60),
        isScreenshot: isScreenshotMedia(m)
      }))
    });
  }

  return {
    id: event.event_id ? String(event.event_id) : (event.event_uuid || String(Date.now())),
    title,
    subtitle: event.subtitle?.trim() || null,
    summary: summary.length > 200 ? summary.substring(0, 197) + '...' : summary,
    url: event.url || '#',
    imageUrl,
    screenshotUrl,
    isImageScreenshot,
    publishedAt: event.published_at || null,
    sourceName: event.source_name || event.media?.[0]?.source_name || null,
    category: event.tags?.[0] || null,
    sentiment: event.sentiment,
  };
}

export async function fetchKoralmEvents(
  limit: number = 300
): Promise<KoralmEvent[]> {
  const baseUrl = resolveApiBaseUrl();

  const url = `${baseUrl}/events?limit=${limit}`;

  console.log('[KoralmAPI] Fetching events from:', url);

  try {
    const response = await fetch(url, { cache: 'no-store' });

    if (!response.ok) {
      console.error('[KoralmAPI] Request failed:', response.status);
      return [];
    }

    const data = await response.json();
    const events = Array.isArray(data.events) ? data.events : [];

    console.log(`[KoralmAPI] Loaded ${events.length} events`);

    // DEBUG: Log first 3 events with media to see structure
    const eventsWithMedia = events.filter((e: any) => e.media && e.media.length > 0).slice(0, 3);
    console.log('[KoralmAPI] First 3 events with media (raw):', eventsWithMedia);

    return events.map((event: any) => mapEventToKoralmEvent(event));
  } catch (error) {
    console.error('[KoralmAPI] Fetch failed:', error);
    return [];
  }
}
