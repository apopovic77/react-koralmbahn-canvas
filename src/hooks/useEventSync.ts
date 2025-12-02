/**
 * useEventSync - Real-time event synchronization via polling
 *
 * Polls the /api/v1/events/changes endpoint every 60 seconds
 * and applies deltas (created, updated, deleted) to local state.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KoralmEvent } from '../types/koralmbahn';

interface EventChanges {
  created: KoralmEvent[];
  updated: KoralmEvent[];
  deleted: number[];
  server_time: string;
}

interface UseEventSyncOptions {
  /** Initial events to sync from */
  initialEvents: KoralmEvent[];
  /** Polling interval in milliseconds (default: 60000 = 60s) */
  pollInterval?: number;
  /** API base URL (default: from environment) */
  apiBaseUrl?: string;
  /** Enable/disable sync (default: true) */
  enabled?: boolean;
  /** Callback when events change */
  onEventsChange?: (events: KoralmEvent[]) => void;
}

interface UseEventSyncResult {
  /** Current synced events */
  events: KoralmEvent[];
  /** Is currently fetching changes */
  isSyncing: boolean;
  /** Last sync timestamp */
  lastSyncTime: Date | null;
  /** Last error (if any) */
  lastError: Error | null;
  /** Manually trigger a sync */
  syncNow: () => Promise<void>;
  /** Stats about last sync */
  lastSyncStats: {
    created: number;
    updated: number;
    deleted: number;
  } | null;
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

export function useEventSync(options: UseEventSyncOptions): UseEventSyncResult {
  const {
    initialEvents,
    pollInterval = 60000,
    apiBaseUrl = resolveApiBaseUrl(),
    enabled = true,
    onEventsChange,
  } = options;

  const [events, setEvents] = useState<KoralmEvent[]>(initialEvents);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<Error | null>(null);
  const [lastSyncStats, setLastSyncStats] = useState<{
    created: number;
    updated: number;
    deleted: number;
  } | null>(null);

  // Track server time for delta queries
  const serverTimeRef = useRef<string | null>(null);

  // Update events when initialEvents change (first load)
  useEffect(() => {
    if (initialEvents.length > 0 && events.length === 0) {
      setEvents(initialEvents);
      // Set initial server time to now
      serverTimeRef.current = new Date().toISOString();
    }
  }, [initialEvents]);

  // Notify parent when events change
  useEffect(() => {
    if (onEventsChange) {
      onEventsChange(events);
    }
  }, [events, onEventsChange]);

  /**
   * Fetch changes from API and apply to local state
   */
  const syncNow = useCallback(async () => {
    if (!serverTimeRef.current || !enabled) return;

    setIsSyncing(true);
    setLastError(null);

    try {
      const url = new URL(`${apiBaseUrl}/api/v1/events/changes`);
      url.searchParams.set('since', serverTimeRef.current);

      console.log(`[EventSync] Fetching changes since ${serverTimeRef.current}`);

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const changes: EventChanges = await response.json();

      // Update server time for next request
      serverTimeRef.current = changes.server_time;

      const hasChanges =
        changes.created.length > 0 ||
        changes.updated.length > 0 ||
        changes.deleted.length > 0;

      if (hasChanges) {
        console.log(
          `[EventSync] Changes: +${changes.created.length} created, ~${changes.updated.length} updated, -${changes.deleted.length} deleted`
        );

        setEvents((prevEvents) => {
          // Create a map for efficient lookup
          const eventMap = new Map(prevEvents.map((e) => [e.id, e]));

          // Remove deleted events
          for (const deletedId of changes.deleted) {
            eventMap.delete(String(deletedId));
          }

          // Update existing events
          for (const updatedEvent of changes.updated) {
            const mappedEvent = mapApiEventToKoralmEvent(updatedEvent);
            eventMap.set(mappedEvent.id, mappedEvent);
          }

          // Add new events
          for (const createdEvent of changes.created) {
            const mappedEvent = mapApiEventToKoralmEvent(createdEvent);
            eventMap.set(mappedEvent.id, mappedEvent);
          }

          return Array.from(eventMap.values());
        });

        setLastSyncStats({
          created: changes.created.length,
          updated: changes.updated.length,
          deleted: changes.deleted.length,
        });
      } else {
        console.log('[EventSync] No changes');
        setLastSyncStats({ created: 0, updated: 0, deleted: 0 });
      }

      setLastSyncTime(new Date());
    } catch (error) {
      console.error('[EventSync] Sync failed:', error);
      setLastError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setIsSyncing(false);
    }
  }, [apiBaseUrl, enabled]);

  // Set up polling interval
  useEffect(() => {
    if (!enabled || pollInterval <= 0) return;

    // Don't start polling until we have initial data
    if (!serverTimeRef.current) return;

    console.log(`[EventSync] Starting polling every ${pollInterval / 1000}s`);

    const intervalId = setInterval(() => {
      syncNow();
    }, pollInterval);

    return () => {
      console.log('[EventSync] Stopping polling');
      clearInterval(intervalId);
    };
  }, [enabled, pollInterval, syncNow]);

  return {
    events,
    isSyncing,
    lastSyncTime,
    lastError,
    syncNow,
    lastSyncStats,
  };
}

/**
 * Map API event response to KoralmEvent format
 * (Simplified version - the full mapping is in koralmbahnApi.ts)
 */
function mapApiEventToKoralmEvent(apiEvent: any): KoralmEvent {
  const STORAGE_BASE_URL = 'https://api-storage.arkturian.com';

  const buildStorageUrl = (id: number | string | null): string | null => {
    if (!id) return null;
    return `${STORAGE_BASE_URL}/storage/media/${id}`;
  };

  const normalizeSnippet = (value?: string | null): string => {
    if (!value) return '';
    return value
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const title =
    apiEvent.title_de?.trim() ||
    apiEvent.title_en?.trim() ||
    'Unbetitelter Beitrag';
  const summary = normalizeSnippet(apiEvent.summary_de || apiEvent.summary_en);

  let imageUrl: string | null = null;
  let screenshotUrl: string | null = null;
  let isImageScreenshot = false;

  if (apiEvent.hero_image_storage_id) {
    imageUrl = buildStorageUrl(apiEvent.hero_image_storage_id);
  }

  if (apiEvent.screenshot_storage_id) {
    screenshotUrl = buildStorageUrl(apiEvent.screenshot_storage_id);
    if (!imageUrl) {
      imageUrl = screenshotUrl;
      isImageScreenshot = true;
      screenshotUrl = null;
    }
  }

  let category: string | null = null;
  if (apiEvent.tags) {
    try {
      const tagsArray = JSON.parse(apiEvent.tags);
      if (Array.isArray(tagsArray) && tagsArray.length > 0) {
        category = tagsArray[0];
      }
    } catch {
      category = apiEvent.tags;
    }
  }

  return {
    id: apiEvent.id ? String(apiEvent.id) : apiEvent.event_uuid,
    title,
    subtitle: apiEvent.subtitle?.trim() || null,
    summary: summary.length > 200 ? summary.substring(0, 197) + '...' : summary,
    url: apiEvent.url || '#',
    imageUrl,
    screenshotUrl,
    isImageScreenshot,
    publishedAt: apiEvent.published_at || null,
    sourceName: null,
    category,
    sentiment: apiEvent.sentiment ?? null,
  };
}
