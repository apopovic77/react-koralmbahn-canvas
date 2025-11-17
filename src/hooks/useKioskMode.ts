import { useEffect, useRef, useState } from 'react';
import type { ViewportTransform } from 'arkturian-canvas-engine';
import type { KoralmEvent } from '../types/koralmbahn';

export type KioskMode = 'overview' | 'article';

interface UseKioskModeOptions {
  viewport: ViewportTransform | null;
  events: KoralmEvent[];
  canvasWidth: number;
  canvasHeight: number;
  isManualMode: boolean;
  isKioskModeEnabled?: boolean;
  overviewDuration?: number;
  articleDuration?: number;
  transitionSpeed?: number;
  articlesBeforeOverview?: number;
}

interface UseKioskModeReturn {
  kioskMode: KioskMode;
  selectedArticleIndex: number;
  articlesViewedCount: number;
  zoomToOverview: () => void;
  zoomToArticle: (index: number) => void;
  stopKiosk: () => void;
}

const DEFAULT_OVERVIEW_DURATION = 10000; // 10 seconds
const DEFAULT_ARTICLE_DURATION = 8000; // 8 seconds
const DEFAULT_TRANSITION_SPEED = 0.0001; // ~2.5 seconds
const DEFAULT_ARTICLES_BEFORE_OVERVIEW = 5;

export function useKioskMode({
  viewport,
  events,
  canvasWidth,
  canvasHeight,
  isManualMode,
  isKioskModeEnabled = true,
  overviewDuration = DEFAULT_OVERVIEW_DURATION,
  articleDuration = DEFAULT_ARTICLE_DURATION,
  transitionSpeed = DEFAULT_TRANSITION_SPEED,
  articlesBeforeOverview = DEFAULT_ARTICLES_BEFORE_OVERVIEW,
}: UseKioskModeOptions): UseKioskModeReturn {
  const [kioskMode, setKioskMode] = useState<KioskMode>('overview');
  const [selectedArticleIndex, setSelectedArticleIndex] = useState<number>(0);
  const [articlesViewedCount, setArticlesViewedCount] = useState<number>(0);
  const kioskTimerRef = useRef<number | null>(null);

  const zoomToOverview = () => {
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
    // @ts-expect-error - Accessing internal properties for kiosk mode
    viewport.targetScale = targetScale;
    // @ts-expect-error - Accessing internal properties for kiosk mode
    viewport.targetOffset = {
      x: (canvasWidth - gridWidth * targetScale) / 2 - minX * targetScale,
      y: (canvasHeight - gridHeight * targetScale) / 2 - minY * targetScale,
    };
    viewport.interpolationSpeed = transitionSpeed;

    console.log('[Kiosk] Zooming to overview');
  };

  const zoomToArticle = (index: number) => {
    if (!viewport || index >= events.length) return;

    const event = events[index];
    if (!event.x || !event.y || !event.width || !event.height) return;

    // Center the article card in viewport
    const targetScale = 1.8; // Zoom in to 180%
    const centerX = event.x + event.width / 2;
    const centerY = event.y + event.height / 2;

    viewport.targetScale = targetScale;
    viewport.targetOffset = {
      x: canvasWidth / 2 - centerX * targetScale,
      y: canvasHeight / 2 - centerY * targetScale,
    };
    viewport.interpolationSpeed = transitionSpeed;

    console.log(`[Kiosk] Zooming to article ${index + 1}/${events.length}: ${event.title}`);
  };

  const stopKiosk = () => {
    if (kioskTimerRef.current) {
      clearTimeout(kioskTimerRef.current);
      kioskTimerRef.current = null;
    }
  };

  const scheduleNextTransition = () => {
    if (kioskTimerRef.current) {
      clearTimeout(kioskTimerRef.current);
    }

    if (kioskMode === 'overview') {
      // Switch to first random article after overview duration
      kioskTimerRef.current = window.setTimeout(() => {
        const randomIndex = Math.floor(Math.random() * events.length);
        setSelectedArticleIndex(randomIndex);
        setArticlesViewedCount(1); // Reset counter and start at 1
        setKioskMode('article');
        zoomToArticle(randomIndex);
      }, overviewDuration);
    } else {
      // In article mode
      kioskTimerRef.current = window.setTimeout(() => {
        if (articlesViewedCount >= articlesBeforeOverview) {
          // Viewed enough articles, return to overview
          setArticlesViewedCount(0);
          setKioskMode('overview');
          zoomToOverview();
        } else {
          // Switch to next random article
          const randomIndex = Math.floor(Math.random() * events.length);
          setSelectedArticleIndex(randomIndex);
          setArticlesViewedCount(prev => prev + 1);
          zoomToArticle(randomIndex);
        }
      }, articleDuration);
    }
  };

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
  }, [kioskMode, selectedArticleIndex, articlesViewedCount, events, isManualMode, isKioskModeEnabled]);

  return {
    kioskMode,
    selectedArticleIndex,
    articlesViewedCount,
    zoomToOverview,
    zoomToArticle,
    stopKiosk,
  };
}
