import type { KoralmEvent } from '../types/koralmbahn';

const STORAGE_BASE_URL =
  (import.meta.env.VITE_KORALMBAHN_STORAGE_URL as string | undefined)?.replace(/\/+$/, '') ??
  'https://api-storage.arkturian.com';

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

  // Production: same origin
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }

  return '';
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
  tags?: string[] | null;
  media?: Array<{
    id?: string | null;
    type?: string | null;
    url?: string | null;
    thumbnail_url?: string | null;
    source_url?: string | null;
    source_name?: string | null;
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

  // Extract image URL from media array with smart format & aspect ratio handling
  let imageUrl: string | null = null;
  if (event.media && event.media.length > 0) {
    const firstMedia = event.media[0];

    // Check if URL is already a storage API URL
    const isStorageUrl = firstMedia?.url?.includes('api-storage.arkturian.com');

    if (isStorageUrl && firstMedia?.url) {
      // Already a storage URL - use directly
      imageUrl = firstMedia.url;
    } else if (firstMedia?.id || firstMedia?.storage_object?.id) {
      // Build storage URL from ID
      const storageId = firstMedia.id || firstMedia.storage_object?.id;
      const mimeType = firstMedia.storage_object?.mime_type;
      const isSvg = mimeType?.toLowerCase().includes('svg');
      const params: Record<string, string | number> = {};

      // SVGs: Always convert to PNG with aspect ratio for letterboxing
      if (isSvg) {
        params.format = 'png';
        params.aspect_ratio = '5:7'; // Card aspect ratio (width:height)
      }

      imageUrl = buildStorageMediaUrl(storageId!, params);
    } else {
      // No storage ID available - skip external URLs to avoid CORS errors
      console.warn(`[KoralmAPI] Event ${event.event_id}: No storage ID, skipping external URL to avoid CORS:`, firstMedia?.url);
      imageUrl = null;
    }
  }

  return {
    id: event.event_id ? String(event.event_id) : (event.event_uuid || String(Date.now())),
    title,
    subtitle: event.subtitle?.trim() || null,
    summary: summary.length > 200 ? summary.substring(0, 197) + '...' : summary,
    url: event.url || '#',
    imageUrl,
    publishedAt: event.published_at || null,
    sourceName: event.media?.[0]?.source_name || null,
    category: event.tags?.[0] || null,
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

    return events.map((event: any) => mapEventToKoralmEvent(event));
  } catch (error) {
    console.error('[KoralmAPI] Fetch failed:', error);
    return [];
  }
}
