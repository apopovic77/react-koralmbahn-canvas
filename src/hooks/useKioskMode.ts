import { useCallback, useEffect, useRef, useState } from 'react';
import type { ViewportTransform } from 'arkturian-canvas-engine';
import type { KoralmEvent } from '../types/koralmbahn';

export type KioskMode = 'overview' | 'article';
export type KioskStrategy = 'random' | 'sequential';

interface UseKioskModeOptions {
  viewport: ViewportTransform | null;
  events: KoralmEvent[];
  canvasWidth: number;
  canvasHeight: number;
  isManualMode: boolean;
  isKioskModeEnabled?: boolean;
  kioskStrategy?: KioskStrategy;
  overviewDuration?: number;
  articleDuration?: number;
  transitionSpeed?: number;
  articlesBeforeOverview?: number;
}

interface UseKioskModeReturn {
  kioskMode: KioskMode;
  kioskStrategy: KioskStrategy;
  selectedArticleIndex: number;
  articlesViewedCount: number;
  priorityQueueLength: number;
  zoomToOverview: () => void;
  zoomToArticle: (index: number) => void;
  stopKiosk: () => void;
  setKioskStrategy: (strategy: KioskStrategy) => void;
}

const DEFAULT_OVERVIEW_DURATION = 10000; // 10 seconds
const DEFAULT_ARTICLE_DURATION = 10000; // 10 seconds
const DEFAULT_TRANSITION_SPEED = 0.06; // speedFactor: 6% per frame
const DEFAULT_ARTICLES_BEFORE_OVERVIEW = 5;

export function useKioskMode({
  viewport,
  events,
  canvasWidth,
  canvasHeight,
  isManualMode,
  isKioskModeEnabled = true,
  kioskStrategy: initialStrategy = 'sequential',
  overviewDuration = DEFAULT_OVERVIEW_DURATION,
  articleDuration = DEFAULT_ARTICLE_DURATION,
  transitionSpeed = DEFAULT_TRANSITION_SPEED,
  articlesBeforeOverview = DEFAULT_ARTICLES_BEFORE_OVERVIEW,
}: UseKioskModeOptions): UseKioskModeReturn {
  const [kioskMode, setKioskMode] = useState<KioskMode>('article'); // Start with article, not overview
  const [kioskStrategy, setKioskStrategy] = useState<KioskStrategy>(initialStrategy);
  const [selectedArticleIndex, setSelectedArticleIndex] = useState<number>(0);
  const [articlesViewedCount, setArticlesViewedCount] = useState<number>(0);
  const kioskTimerRef = useRef<number | null>(null);

  // Priority queue for new events (used in BOTH modes - new articles are shown first)
  const [priorityQueue, setPriorityQueue] = useState<string[]>([]);
  const knownEventIdsRef = useRef<Set<string>>(new Set());

  // Detect new events and add to priority queue (works for BOTH sequential and random mode)
  useEffect(() => {
    if (events.length === 0) return;

    const currentIds = new Set(events.map(e => e.id));
    const newEventIds: string[] = [];

    // Find events that weren't in the previous set
    currentIds.forEach(id => {
      if (!knownEventIdsRef.current.has(id)) {
        newEventIds.push(id);
      }
    });

    // Update known IDs
    knownEventIdsRef.current = currentIds;

    // Add new events to priority queue (if not first load)
    if (newEventIds.length > 0 && knownEventIdsRef.current.size > newEventIds.length) {
      console.log(`[Kiosk] New events detected: ${newEventIds.length} - adding to priority queue (mode: ${kioskStrategy})`);
      setPriorityQueue(prev => [...newEventIds, ...prev]);
    }
  }, [events, kioskStrategy]);

  const zoomToOverview = useCallback(() => {
    if (!viewport || events.length === 0) return;

    // Calculate scale to fit all content in viewport
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    events.forEach(event => {
      if (event.x !== undefined && event.y !== undefined && event.width && event.height) {
        minX = Math.min(minX, event.x);
        minY = Math.min(minY, event.y);
        maxX = Math.max(maxX, event.x + event.width);
        maxY = Math.max(maxY, event.y + event.height);
      }
    });

    const gridWidth = maxX - minX;
    const gridHeight = maxY - minY;

    const scaleX = canvasWidth / gridWidth;
    const scaleY = canvasHeight / gridHeight;
    const targetScale = Math.min(scaleX, scaleY, 1) * 0.9; // 90% to add padding

    // Center the grid within the viewport
    // Add vertical offset to visually center (content has axis at top, so shift down)
    const verticalOffset = canvasHeight * 0.08; // 8% of screen height shift down

    // @ts-expect-error - Accessing internal properties for kiosk mode
    viewport.targetScale = targetScale;
    // @ts-expect-error - Accessing internal properties for kiosk mode
    viewport.targetOffset = {
      x: (canvasWidth - gridWidth * targetScale) / 2 - minX * targetScale,
      y: (canvasHeight - gridHeight * targetScale) / 2 - minY * targetScale + verticalOffset,
    };
    // Set animation speed (speedFactor: 0-1, lower = slower)
    viewport.speedFactor = transitionSpeed;

    console.log('[Kiosk] Zooming to overview');
  }, [viewport, events, canvasWidth, canvasHeight, transitionSpeed]);

  const zoomToArticle = useCallback((index: number) => {
    if (!viewport || index >= events.length || index < 0) return;

    const event = events[index];
    if (!event.x || !event.y || !event.width || !event.height) return;

    // Center the article card in viewport
    const targetScale = 1.75; // Zoom in to 180%
    const centerX = event.x + event.width / 2;
    const centerY = event.y + event.height / 2;

    // @ts-expect-error - Accessing internal properties for kiosk mode
    viewport.targetScale = targetScale;
    // @ts-expect-error - Accessing internal properties for kiosk mode
    viewport.targetOffset = {
      x: canvasWidth / 2 - centerX * targetScale,
      y: canvasHeight / 2 - centerY * targetScale,
    };
    // Set animation speed (speedFactor: 0-1, lower = slower)
    viewport.speedFactor = transitionSpeed;

    console.log(`[Kiosk] Zooming to article ${index + 1}/${events.length}: ${event.title}`);
  }, [viewport, events, canvasWidth, canvasHeight, transitionSpeed]);

  const stopKiosk = useCallback(() => {
    if (kioskTimerRef.current) {
      clearTimeout(kioskTimerRef.current);
      kioskTimerRef.current = null;
    }
  }, []);

  // Get next article index based on strategy
  const getNextArticleIndex = useCallback((): number => {
    // BOTH modes: Check priority queue first (new articles get shown immediately)
    if (priorityQueue.length > 0) {
      const priorityEventId = priorityQueue[0];
      const priorityIndex = events.findIndex(e => e.id === priorityEventId);

      if (priorityIndex !== -1) {
        // Remove from queue
        setPriorityQueue(prev => prev.slice(1));
        console.log(`[Kiosk] Showing NEW event (priority): ${events[priorityIndex].title}`);
        return priorityIndex;
      } else {
        // Event no longer exists, remove from queue and continue
        setPriorityQueue(prev => prev.slice(1));
      }
    }

    if (kioskStrategy === 'sequential') {
      // Sequential: go through articles in order (index 0 = newest)
      // When at end, wrap to beginning
      const nextIndex = selectedArticleIndex + 1;
      if (nextIndex >= events.length) {
        return 0; // Wrap to first (newest)
      }
      return nextIndex;
    }

    // Random mode: Weighted probability - newer articles have higher chance
    // Events are sorted by date (index 0 = newest), so lower index = newer
    // Use exponential decay: weight = e^(-index * decay)
    const decayFactor = 0.05; // Higher = steeper decay (more bias toward new)
    const weights: number[] = [];
    let totalWeight = 0;

    for (let i = 0; i < events.length; i++) {
      // Exponential weight: newest (i=0) gets weight ~1, older gets less
      const weight = Math.exp(-i * decayFactor);
      weights.push(weight);
      totalWeight += weight;
    }

    // Pick random based on weights
    let random = Math.random() * totalWeight;
    for (let i = 0; i < events.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        console.log(`[Kiosk] Weighted random selected index ${i} (weight: ${(weights[i] / totalWeight * 100).toFixed(1)}%)`);
        return i;
      }
    }

    // Fallback (shouldn't reach)
    return 0;
  }, [events, priorityQueue, selectedArticleIndex, kioskStrategy]);

  // Check if we should show overview (both modes use articlesBeforeOverview)
  const shouldShowOverviewNow = useCallback((): boolean => {
    return articlesViewedCount >= articlesBeforeOverview;
  }, [articlesViewedCount, articlesBeforeOverview]);

  const scheduleNextTransition = useCallback(() => {
    if (kioskTimerRef.current) {
      clearTimeout(kioskTimerRef.current);
    }

    if (kioskMode === 'overview') {
      // Switch to first article after overview duration
      kioskTimerRef.current = window.setTimeout(() => {
        const startIndex = kioskStrategy === 'sequential' ? 0 : getNextArticleIndex();
        setSelectedArticleIndex(startIndex);
        setArticlesViewedCount(1);
        setKioskMode('article');
        zoomToArticle(startIndex);
      }, overviewDuration);
    } else {
      // In article mode
      kioskTimerRef.current = window.setTimeout(() => {
        // Check if we have priority events (BOTH modes now support this)
        const hasPriorityEvents = priorityQueue.length > 0;

        // Check if should go to overview (both modes after N articles, skip if priority events)
        const shouldShowOverview = !hasPriorityEvents && shouldShowOverviewNow();

        if (shouldShowOverview) {
          // Return to overview
          setArticlesViewedCount(0);
          setKioskMode('overview');
          zoomToOverview();
        } else {
          // Switch to next article
          const nextIndex = getNextArticleIndex();
          setSelectedArticleIndex(nextIndex);
          setArticlesViewedCount(prev => prev + 1);
          zoomToArticle(nextIndex);
        }
      }, articleDuration);
    }
  }, [
    kioskMode,
    kioskStrategy,
    priorityQueue.length,
    overviewDuration,
    articleDuration,
    getNextArticleIndex,
    shouldShowOverviewNow,
    zoomToOverview,
    zoomToArticle,
  ]);

  // Kiosk mode auto-zoom system
  useEffect(() => {
    if (!viewport || events.length === 0) return;

    // Skip kiosk mode if disabled via F3 or in manual mode
    if (!isKioskModeEnabled || isManualMode) {
      stopKiosk();
      return;
    }

    // Initial state
    if (kioskMode === 'overview') {
      zoomToOverview();
    } else {
      zoomToArticle(selectedArticleIndex);
    }

    scheduleNextTransition();

    return () => {
      stopKiosk();
    };
  }, [kioskMode, selectedArticleIndex, articlesViewedCount, events, isManualMode, isKioskModeEnabled, priorityQueue, kioskStrategy]);

  // Reset when strategy changes
  useEffect(() => {
    setArticlesViewedCount(0);
    setSelectedArticleIndex(0);
    console.log(`[Kiosk] Strategy changed to: ${kioskStrategy}`);
  }, [kioskStrategy]);

  return {
    kioskMode,
    kioskStrategy,
    selectedArticleIndex,
    articlesViewedCount,
    priorityQueueLength: priorityQueue.length,
    zoomToOverview,
    zoomToArticle,
    stopKiosk,
    setKioskStrategy,
  };
}
