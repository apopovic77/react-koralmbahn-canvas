import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import './App.css';
import { ViewportTransform, useLODTransitions } from 'arkturian-canvas-engine';
import { LayoutEngine } from 'arkturian-canvas-engine/src/layout/LayoutEngine';
import type { LayoutNode } from 'arkturian-canvas-engine/src/layout/LayoutNode';

import { fetchKoralmEvents } from './api/koralmbahnApi';
import type { CardStyle, KoralmEvent } from './types/koralmbahn';
import { useKioskMode } from './hooks/useKioskMode';
import { useManualMode } from './hooks/useManualMode';
import { useImageCache } from './hooks/useImageCache';
import { useEventSync } from './hooks/useEventSync';
import { QRCodeFactory } from './services/QRCodeFactory';
import { DayTimelineLayouter, type DayAxisRow, type DayTimelineBounds, type DayTimelineLayouterConfig } from './layouts/DayTimelineLayouter';
import { DayTimelinePortraitLayouter, type DayAxisColumn, type DayTimelinePortraitBounds } from './layouts/DayTimelinePortraitLayouter';
import { SingleRowTimelineLayouter, type SingleRowBounds } from './layouts/SingleRowTimelineLayouter';
import { MasonryLayouter } from './layouts/MasonryLayouter';
import { EventCanvasRenderer } from './render/EventCanvasRenderer';
import { CanvasViewportController } from './viewport/CanvasViewportController';
import { SnapToContentController } from './viewport/SnapToContentController';
import SciFiDashboard from './effects/SciFiDashboard/SciFiDashboard';

// Viewport Mode: 3 modes for different border checking behaviors
type ViewportMode = 'off' | 'rectBounds' | 'snapToContent';

// Layout Mode: 5 modes for different layout algorithms
type LayoutMode = 'dayTimeline' | 'dayTimelinePortrait' | 'singleRow' | 'masonryVertical' | 'masonryHorizontal';

const PADDING = 15;

// Performance settings (game engine pattern)
const RENDER_FPS = 60; // Visual rendering at 60 FPS for smooth animations
const UPDATE_FPS = 25; // Logic updates (culling, LOD) at 25 FPS for performance

// Image LOD (Level of Detail) threshold
const IMAGE_LOD_THRESHOLD = 1.5; // Above this zoom: use high-res images, below: use thumbnails

// Auto-Card-Style mapping for each Layout Mode
function getDefaultCardStyleForLayout(layoutMode: LayoutMode): CardStyle {
  switch (layoutMode) {
    case 'dayTimeline':
      return 'standard'; // Standard cards: 50% image, 50% text
    case 'dayTimelinePortrait':
      return 'standard'; // Standard cards for portrait monitors
    case 'singleRow':
      return 'standard'; // Standard cards: 50% image, 50% text
    case 'masonryVertical':
      return 'catalog'; // Compact newspaper/catalog layout with variable height
    case 'masonryHorizontal':
      return 'imageOnly'; // Image-only grid
    default:
      return 'standard';
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<ViewportTransform | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const lastUpdateTimeRef = useRef<number>(0); // Separate timer for update loop
  const dayLayouterRef = useRef(new DayTimelineLayouter());
  const dayPortraitLayouterRef = useRef(new DayTimelinePortraitLayouter());
  const singleRowLayouterRef = useRef(new SingleRowTimelineLayouter());

  // Masonry layouters need to be created inside component to access getImage
  const masonryVerticalLayouterRef = useRef<MasonryLayouter | null>(null);
  const masonryHorizontalLayouterRef = useRef<MasonryLayouter | null>(null);
  const layoutEngineRef = useRef(new LayoutEngine<KoralmEvent>(dayLayouterRef.current));
  const viewportControllerRef = useRef(new CanvasViewportController());
  const snapControllerRef = useRef(new SnapToContentController());
  const rendererRef = useRef<EventCanvasRenderer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [events, setEvents] = useState<KoralmEvent[]>([]);
  const [positionedEvents, setPositionedEvents] = useState<KoralmEvent[]>([]);
  const [axisRows, setAxisRows] = useState<DayAxisRow[]>([]);
  const [axisColumns, setAxisColumns] = useState<DayAxisColumn[]>([]);
  const [layoutBounds, setLayoutBounds] = useState<DayTimelineBounds | null>(null);
  const [layoutMetrics] = useState<DayTimelineLayouterConfig>(dayLayouterRef.current.getMetrics());
  const [viewportSize, setViewportSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [is3DMode, setIs3DMode] = useState(false); // F1: 3D Mode (Default: OFF)
  const [isLODEnabled, setIsLODEnabled] = useState(true);
  const [isKioskModeEnabled, setIsKioskModeEnabled] = useState(true); // F3: Kiosk Mode (Default: ON)
  const [isHighResEnabled, setIsHighResEnabled] = useState(true); // F4: HighRes (Default: ON)
  const [showSciFiDashboard, setShowSciFiDashboard] = useState(false); // F6 toggle
  const [viewportMode, setViewportMode] = useState<ViewportMode>('off'); // F7: Viewport Mode (Default: OFF)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('dayTimelinePortrait'); // F8: Layout Mode (Default: dayTimelinePortrait)
  const [showDebugPanel, setShowDebugPanel] = useState(false); // F9: Debug Panel (Default: OFF)
  const [cardStyle, setCardStyle] = useState<CardStyle>('imageOnly'); // F10: Card Style (Default: imageOnly)
  const [isGlowBorderEnabled, setIsGlowBorderEnabled] = useState(true); // F11: Glow Border on active kiosk card (Default: ON)
  const [isMinGroupingEnabled, setIsMinGroupingEnabled] = useState(true); // F12: Min 2 per column grouping (Default: ON)
  const [showCompactAxis, setShowCompactAxis] = useState(false); // Compact axis mode when zoomed out (Default: OFF)
  const [sentimentFilter, setSentimentFilter] = useState<'all' | 'positive' | 'neutral' | 'negative'>('all'); // Sentiment filter
  const [heroImageOnly, setHeroImageOnly] = useState(false); // Only show events with hero images (not screenshots)
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Click detection refs (to distinguish clicks from drags)
  const mouseDownPosRef = useRef<{ x: number; y: number; button: number } | null>(null);
  const CLICK_THRESHOLD = 5; // pixels

  // Failed image loads tracking (to prevent endless 404 retries)
  const failedImagesRef = useRef<Set<string>>(new Set());

  // Custom hooks
  const { getImage, loadHighResImage, preloadImages } = useImageCache();
  const { updateLODState } = useLODTransitions();

  // Real-time sync - polls for changes every 60 seconds
  const {
    isSyncing,
    lastSyncTime,
    lastSyncStats,
  } = useEventSync({
    initialEvents: events,
    pollInterval: 60000, // 60 seconds
    enabled: events.length > 0, // Only enable after initial load
    onEventsChange: (newEvents) => {
      // Update the main events state when sync detects changes
      if (newEvents.length !== events.length) {
        setEvents(newEvents);
      }
    },
  });

  // Transform and filter events based on toggles
  const displayEvents = useMemo(() => {
    let filtered = events;

    // Filter: Hero Image Only (exclude screenshot-only events)
    if (heroImageOnly) {
      filtered = filtered.filter(event => !event.isImageScreenshot && event.imageUrl);
    }

    // Filter: Sentiment
    if (sentimentFilter !== 'all') {
      filtered = filtered.filter(event => {
        const sentiment = event.sentiment ?? 0;
        if (sentimentFilter === 'positive') return sentiment > 0.2;
        if (sentimentFilter === 'negative') return sentiment < -0.2;
        if (sentimentFilter === 'neutral') return sentiment >= -0.2 && sentiment <= 0.2;
        return true;
      });
    }

    return filtered;
  }, [events, heroImageOnly, sentimentFilter]);

  useEffect(() => {
    rendererRef.current = new EventCanvasRenderer({
      padding: PADDING,
      imageLODThreshold: IMAGE_LOD_THRESHOLD,
      getImage,
      loadHighResImage,
      updateLODState,
      enableHighResFetch: isHighResEnabled,
    });

    // Initialize masonry layouters with image aspect ratio callback
    const getImageAspectRatio = (node: LayoutNode<KoralmEvent>) => {
      const event = node.data;
      if (!event.imageUrl) return null;

      // Try to get the loaded image from cache (try high-res first, then thumbnail)
      const img = getImage(event.imageUrl, true) || getImage(event.imageUrl, false);
      if (img && img.complete && img.width > 0 && img.height > 0) {
        return img.width / img.height;
      }

      return null; // Will use default aspect ratio
    };

    // Callback to add extra height for catalog cards (which need space for text)
    const getExtraHeight = (node: LayoutNode<KoralmEvent>, _baseHeight: number): number => {
      const cardStyle = node.data.cardStyle;

      if (cardStyle === 'catalog') {
        // Catalog cards need extra space for:
        // - Title (3-4 lines: ~68px)
        // - Subtitle/Source (1-2 lines: ~28px)
        // - Summary (variable, estimate ~112px for ~8 lines)
        // - QR code area (50px + padding ~20px)
        // - Padding (top: 12px, between elements: ~22px, bottom for QR: 20px)
        // Total text area: ~300px
        return 300;
      }

      return 0; // No extra height for other card styles
    };

    masonryVerticalLayouterRef.current = new MasonryLayouter({
      direction: 'vertical',
      columnCount: 4,
      targetWidth: 300,
      gap: 16,
      padding: 50,
      defaultAspectRatio: 5 / 7,
      getImageAspectRatio,
      getExtraHeight,
    });

    masonryHorizontalLayouterRef.current = new MasonryLayouter({
      direction: 'horizontal',
      rowCount: 3,
      targetHeight: 300,
      gap: 16,
      padding: 50,
      defaultAspectRatio: 5 / 7,
      getImageAspectRatio,
      getExtraHeight,
    });
  }, [getImage, loadHighResImage, updateLODState, isHighResEnabled]);

  // Manual mode hook
  const { isManualMode, manuallySelectedIndex, handleCanvasClick, handleCanvasRightClick, handleManualInteraction } = useManualMode({
    viewport: viewportRef.current,
    getLayoutNodes: () => layoutEngineRef.current.all(),
    canvasWidth: window.innerWidth,
    canvasHeight: window.innerHeight,
    isKioskModeEnabled,
  });

  // Wrap manual interaction to also notify snap controller
  const handleUserInteraction = () => {
    handleManualInteraction();
    snapControllerRef.current.notifyInteraction();
  };

  // Kiosk mode hook
  const { kioskMode, kioskStrategy, articlesViewedCount, selectedArticleIndex, setKioskStrategy } = useKioskMode({
    viewport: viewportRef.current,
    events: positionedEvents,
    canvasWidth: window.innerWidth,
    canvasHeight: window.innerHeight,
    isManualMode,
    isKioskModeEnabled,
  });

  // Custom click handlers that work with viewport drag
  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    mouseDownPosRef.current = {
      x: event.clientX,
      y: event.clientY,
      button: event.button,
    };
    console.log(`[ClickDetection] MouseDown at (${event.clientX}, ${event.clientY}), button: ${event.button}`);
  };

  const handleMouseUp = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!mouseDownPosRef.current) {
      console.log('[ClickDetection] MouseUp without MouseDown');
      return;
    }

    const downPos = mouseDownPosRef.current;
    const distance = Math.sqrt(
      Math.pow(event.clientX - downPos.x, 2) +
      Math.pow(event.clientY - downPos.y, 2)
    );

    console.log(`[ClickDetection] MouseUp at (${event.clientX}, ${event.clientY}), distance: ${distance.toFixed(2)}px`);

    // If mouse didn't move much, treat it as a click
    if (distance < CLICK_THRESHOLD) {
      console.log(`[ClickDetection] Detected CLICK (button ${downPos.button})`);

      if (downPos.button === 0) {
        // Left click
        handleCanvasClick(event);
      } else if (downPos.button === 2) {
        // Right click
        handleCanvasRightClick(event);
      }
    } else {
      console.log(`[ClickDetection] Movement detected (${distance.toFixed(2)}px), ignoring as drag`);
    }

    mouseDownPosRef.current = null;
  };

  // Combined touch event handlers for mobile devices (click detection + manual interaction)
  const handleTouchStart = (event: React.TouchEvent<HTMLCanvasElement>) => {
    // Call manual interaction handler for kiosk mode + snap controller
    handleUserInteraction();

    // Click detection
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      mouseDownPosRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        button: 0, // Touch events behave like left clicks
      };
      console.log(`[ClickDetection] TouchStart at (${touch.clientX}, ${touch.clientY})`);
    }
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLCanvasElement>) => {
    if (!mouseDownPosRef.current) {
      console.log('[ClickDetection] TouchEnd without TouchStart');
      return;
    }

    if (event.changedTouches.length === 1) {
      const touch = event.changedTouches[0];
      const downPos = mouseDownPosRef.current;
      const distance = Math.sqrt(
        Math.pow(touch.clientX - downPos.x, 2) +
        Math.pow(touch.clientY - downPos.y, 2)
      );

      console.log(`[ClickDetection] TouchEnd at (${touch.clientX}, ${touch.clientY}), distance: ${distance.toFixed(2)}px`);

      // If touch didn't move much, treat it as a tap/click
      if (distance < CLICK_THRESHOLD) {
        console.log('[ClickDetection] Detected TAP');
        // Create a synthetic event object for handleCanvasClick
        // Include currentTarget so getBoundingClientRect works
        const syntheticEvent = {
          clientX: touch.clientX,
          clientY: touch.clientY,
          currentTarget: event.currentTarget,
        } as React.MouseEvent<HTMLCanvasElement>;
        handleCanvasClick(syntheticEvent);
      } else {
        console.log(`[ClickDetection] Movement detected (${distance.toFixed(2)}px), ignoring as drag`);
      }
    }

    mouseDownPosRef.current = null;
  };

  const handleEventSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const query = formData.get('eventId')?.toString().trim();
    if (!query) return;

    const match = layoutEngineRef.current
      .all()
      .find((node) => node.data.id.toLowerCase() === query.toLowerCase());

    if (!match || !match.width.value || !match.height.value) {
      console.log(`[Search] No event found with ID ${query}`);
      return;
    }

    const centerX = (match.posX.value ?? 0) + (match.width.value ?? 0) / 2;
    const centerY = (match.posY.value ?? 0) + (match.height.value ?? 0) / 2;
    const canvasWidth = window.innerWidth;
    const canvasHeight = window.innerHeight;
    const targetScale = Math.min(
      (canvasWidth * 0.8) / (match.width.value ?? 1),
      (canvasHeight * 0.8) / (match.height.value ?? 1)
    );

    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.centerOn(centerX, centerY, targetScale);
    
    event.currentTarget.reset();
    searchInputRef.current?.blur();
  };

  // Load events on mount
  useEffect(() => {
    async function loadEvents() {
      console.log('[App] Loading Koralmbahn events...');
      const data = await fetchKoralmEvents(1000);
      setEvents(data);
      console.log(`[App] Loaded ${data.length} events`);

      await preloadImages(data);
    }

    loadEvents();
  }, []);

  // Generate QR codes when events change
  // Store QR codes in a ref to persist across re-renders and avoid race conditions
  const qrCodeMapRef = useRef<Map<string, HTMLImageElement>>(new Map());

  useEffect(() => {
    if (events.length === 0) return;

    // Skip if events already have QR codes (avoid regeneration on every render)
    const firstEventHasQR = events[0]?.qrCode != null;
    const mapHasAllCodes = qrCodeMapRef.current.size === events.length;

    if (firstEventHasQR && mapHasAllCodes) {
      console.log(`[QR Codes] Skipping - already have ${events.length} QR codes`);
      return;
    }

    qrCodeMapRef.current.clear();

    // Determine base URL for museum article pages
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

    let completedCount = 0;
    const totalCount = events.length;

    console.log(`[QR Codes] Starting generation for ${totalCount} events`);

    events.forEach(async (event) => {
      try {
        // Always use museum article page URL
        const qrUrl = `${baseUrl}/article/${event.id}`;

        // Use QRCodeFactory to generate the image (white on transparent)
        const qrImg = await QRCodeFactory.generateImage(qrUrl, {
          width: 80,
          margin: 1,
          color: {
            dark: '#ffffff',    // White QR code
            light: '#00000000', // Transparent background
          },
        });

        qrCodeMapRef.current.set(event.id, qrImg);
        completedCount++;

        // Update events state with QR codes when all are ready
        if (completedCount === totalCount) {
          console.log(`[QR Codes] All ${totalCount} QR codes generated`);

          // Use functional update to get latest events state
          setEvents(prevEvents => {
            // Only update if prevEvents has the same events we generated for
            if (prevEvents.length === 0) {
              console.log(`[QR Codes] Warning: prevEvents is empty, skipping update`);
              return prevEvents;
            }

            const updated = prevEvents.map(e => ({
              ...e,
              qrCode: qrCodeMapRef.current.get(e.id) ?? e.qrCode,
            }));

            const assignedCount = updated.filter(e => e.qrCode != null).length;
            console.log(`[QR Codes] Assigned QR codes to ${assignedCount}/${updated.length} events`);

            return updated;
          });
        }
      } catch (error) {
        console.error(`[App] QR code generation failed for event ${event.id}:`, error);
        completedCount++;
      }
    });
  }, [events.length]); // Only trigger on events.length change

  useEffect(() => {
    // Set overflow hidden for body/html when App is mounted
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.height = '100%';
    document.body.style.height = '100%';

    return () => {
      // Reset when unmounted
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      document.documentElement.style.height = '';
      document.body.style.height = '';
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = viewportControllerRef.current;
    const viewport = controller.init(canvas);
    viewportRef.current = viewport;

    // v1.0.16: 3-mode viewport system with separate translation/scale rubber banding
    // Start with 'off' mode (no bounds)
    console.log('[Viewport] Initialized (v1.0.16) - 3-Mode System: OFF | RectBounds | SnapToContent');

    return () => {
      controller.destroy();
      viewportRef.current = null;
    };
  }, []);

  // Apply viewport mode settings when mode changes
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    switch (viewportMode) {
      case 'off':
        // No bounds checking at all
        viewport.setEnableRubberBandingTranslation(false);
        viewport.setEnableRubberBandingScale(false);
        console.log('[Viewport Mode] OFF - No bounds, free panning/zooming');
        break;
      case 'rectBounds':
        // Classic rubber banding for both translation and scale
        viewport.setEnableRubberBandingTranslation(true);
        viewport.setEnableRubberBandingScale(true);
        console.log('[Viewport Mode] RectBounds - Translation + Scale bounds with rubber banding');
        break;
      case 'snapToContent':
        // Scale bounds with 50× maxScale, no translation bounds, Snap-to-Content active
        viewport.setEnableRubberBandingTranslation(false);
        viewport.setEnableRubberBandingScale(true);
        console.log('[Viewport Mode] SnapToContent - Scale bounds (50×), free pan, Snap-to-Content active');
        break;
    }
  }, [viewportMode]);

  useEffect(() => {
    viewportControllerRef.current.updateBounds(layoutBounds, positionedEvents);
  }, [layoutBounds, positionedEvents]);

  // Switch layouter based on mode
  useEffect(() => {
    const layoutEngine = layoutEngineRef.current;

    if (layoutMode === 'dayTimeline') {
      layoutEngine.setLayouter(dayLayouterRef.current);
    } else if (layoutMode === 'dayTimelinePortrait') {
      layoutEngine.setLayouter(dayPortraitLayouterRef.current);
    } else if (layoutMode === 'singleRow') {
      layoutEngine.setLayouter(singleRowLayouterRef.current);
    } else if (layoutMode === 'masonryVertical') {
      if (masonryVerticalLayouterRef.current) {
        layoutEngine.setLayouter(masonryVerticalLayouterRef.current);
      }
    } else if (layoutMode === 'masonryHorizontal') {
      if (masonryHorizontalLayouterRef.current) {
        layoutEngine.setLayouter(masonryHorizontalLayouterRef.current);
      }
    }

    console.log(`[Layout Mode] Switched to ${layoutMode}`);
  }, [layoutMode]);

  // Update portrait layouter when min grouping toggle changes (F12)
  useEffect(() => {
    // Recreate portrait layouter with updated config
    dayPortraitLayouterRef.current = new DayTimelinePortraitLayouter({
      minArticlesPerColumn: isMinGroupingEnabled ? 2 : 1,
    });

    // If currently using portrait mode, update the layout engine
    if (layoutMode === 'dayTimelinePortrait') {
      layoutEngineRef.current.setLayouter(dayPortraitLayouterRef.current);
    }
  }, [isMinGroupingEnabled, layoutMode]);

  useEffect(() => {
    const layoutEngine = layoutEngineRef.current;

    // Apply F10-controlled cardStyle to all events (including masonry modes)
    const eventsWithCardStyle = displayEvents.map((event) => ({
      ...event,
      cardStyle: cardStyle, // Use the F10-controlled cardStyle state for ALL layouts
    }));

    layoutEngine.sync(eventsWithCardStyle, (event) => event.id);
    layoutEngine.layout(viewportSize);

    // Get bounds based on current layout mode
    let bounds: DayTimelineBounds | DayTimelinePortraitBounds | SingleRowBounds;
    if (layoutMode === 'dayTimeline') {
      const layouter = dayLayouterRef.current;
      setAxisRows(layouter.getAxisRows());
      setAxisColumns([]);
      bounds = layouter.getContentBounds();
    } else if (layoutMode === 'dayTimelinePortrait') {
      const layouter = dayPortraitLayouterRef.current;
      setAxisRows([]);
      setAxisColumns(layouter.getAxisColumns());
      bounds = layouter.getContentBounds();
    } else if (layoutMode === 'singleRow') {
      setAxisRows([]);
      setAxisColumns([]);
      bounds = singleRowLayouterRef.current.getContentBounds();
    } else if (layoutMode === 'masonryVertical') {
      setAxisRows([]);
      setAxisColumns([]);
      bounds = masonryVerticalLayouterRef.current?.getContentBounds() || { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    } else {
      // masonryHorizontal
      setAxisRows([]);
      setAxisColumns([]);
      bounds = masonryHorizontalLayouterRef.current?.getContentBounds() || { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    }

    setLayoutBounds(bounds);

    const nodes = layoutEngine.all();
    // Create a map of current events to get latest qrCode values
    const eventMap = new Map(displayEvents.map(e => [e.id, e]));
    const positioned = nodes.map((node) => {
      // Merge node.data with current event to get latest qrCode
      const currentEvent = eventMap.get(node.data.id);
      // Also check qrCodeMapRef as fallback (in case events state hasn't been updated yet)
      const qrCode = currentEvent?.qrCode ?? qrCodeMapRef.current.get(node.data.id) ?? node.data.qrCode;
      return {
        ...node.data,
        ...currentEvent, // Override with current event data (includes qrCode)
        qrCode, // Explicit qrCode with ref fallback
        x: node.posX.value ?? 0,
        y: node.posY.value ?? 0,
        width: node.width.value ?? 0,
        height: node.height.value ?? 0,
      };
    });
    setPositionedEvents(positioned);
  }, [displayEvents, viewportSize, layoutMode, cardStyle, isMinGroupingEnabled]);

  // F1/F2/F3 key toggles
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F1') {
        event.preventDefault();
        setIs3DMode((prev) => {
          console.log(`[3D Toggle] Switching to ${!prev ? '3D' : '2D'} mode`);
          return !prev;
        });
      }
      if (event.key === 'F2') {
        event.preventDefault();
        setIsLODEnabled((prev) => {
          console.log(`[LOD Toggle] LOD ${!prev ? 'ENABLED' : 'DISABLED'}`);
          return !prev;
        });
      }
      if (event.key === 'F3') {
        event.preventDefault();
        setIsKioskModeEnabled((prev) => {
          console.log(`[Kiosk Toggle] Kiosk Mode ${!prev ? 'ENABLED' : 'DISABLED'}`);
          return !prev;
        });
      }
      if (event.key === 'F4') {
        event.preventDefault();
        setIsHighResEnabled((prev) => {
          console.log(`[HighRes Toggle] High-Res Fetch ${!prev ? 'ENABLED' : 'DISABLED'}`);
          return !prev;
        });
      }
      if (event.key === 'F6') {
        event.preventDefault();
        setShowSciFiDashboard((prev) => {
          console.log(`[SciFi Toggle] Dashboard ${!prev ? 'ENABLED' : 'DISABLED'}`);
          return !prev;
        });
      }
      if (event.key === 'F7') {
        event.preventDefault();
        setViewportMode((prev) => {
          const nextMode = prev === 'off' ? 'rectBounds' : prev === 'rectBounds' ? 'snapToContent' : 'off';
          console.log(`[Viewport Mode] Cycling: ${prev.toUpperCase()} → ${nextMode.toUpperCase()}`);
          return nextMode;
        });
      }
      if (event.key === 'F8') {
        event.preventDefault();
        setLayoutMode((prev) => {
          let nextMode: LayoutMode;
          if (prev === 'dayTimeline') {
            nextMode = 'dayTimelinePortrait';
          } else if (prev === 'dayTimelinePortrait') {
            nextMode = 'singleRow';
          } else if (prev === 'singleRow') {
            nextMode = 'masonryVertical';
          } else if (prev === 'masonryVertical') {
            nextMode = 'masonryHorizontal';
          } else {
            nextMode = 'dayTimeline';
          }

          // Auto-set card style for new layout mode
          const autoCardStyle = getDefaultCardStyleForLayout(nextMode);
          setCardStyle(autoCardStyle);

          console.log(`[Layout Mode] Switching: ${prev} → ${nextMode} (Auto Card Style: ${autoCardStyle})`);
          return nextMode;
        });
      }
      if (event.key === 'F9') {
        event.preventDefault();
        setShowDebugPanel((prev) => {
          console.log(`[Debug Panel] ${!prev ? 'VISIBLE' : 'HIDDEN'}`);
          return !prev;
        });
      }
      if (event.key === 'F10') {
        event.preventDefault();
        setCardStyle((prev) => {
          let nextStyle: CardStyle;
          if (prev === 'standard') {
            nextStyle = 'catalog';
          } else if (prev === 'catalog') {
            nextStyle = 'imageOnly';
          } else {
            nextStyle = 'standard';
          }
          console.log(`[Card Style] Switching: ${prev} → ${nextStyle}`);
          return nextStyle;
        });
      }
      if (event.key === 'F11') {
        event.preventDefault();
        setIsGlowBorderEnabled((prev) => {
          console.log(`[Glow Border] ${!prev ? 'ENABLED' : 'DISABLED'}`);
          return !prev;
        });
      }
      if (event.key === 'F12') {
        event.preventDefault();
        setIsMinGroupingEnabled((prev) => {
          console.log(`[Min Grouping] ${!prev ? 'ENABLED (min 2 per column)' : 'DISABLED (1 per column allowed)'}`);
          return !prev;
        });
      }
      if (event.key === 'f' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        if (searchInputRef.current) {
          searchInputRef.current.focus();
          searchInputRef.current.select();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !viewport || !renderer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderInterval = 1000 / RENDER_FPS;
    const updateInterval = 1000 / UPDATE_FPS;

    const render = (currentTime: number) => {
      const renderDelta = currentTime - lastFrameTimeRef.current;
      if (renderDelta < renderInterval) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }
      lastFrameTimeRef.current = currentTime - (renderDelta % renderInterval);

      const updateDelta = currentTime - lastUpdateTimeRef.current;
      const shouldUpdate = updateDelta >= updateInterval;
      if (shouldUpdate) {
        lastUpdateTimeRef.current = currentTime - (updateDelta % updateInterval);
      }

      viewport.update();

      // Snap-to-Content: Only active in 'snapToContent' mode
      if (viewportMode === 'snapToContent') {
        snapControllerRef.current.update(
          viewport,
          positionedEvents,
          axisRows,
          window.innerWidth,
          window.innerHeight
        );
      }

      const nodes = layoutEngineRef.current.all();

      // Create eventMap from displayEvents for current event data (with QR codes)
      // Also check qrCodeMapRef for events that haven't been updated in state yet
      const eventMapForRender = new Map<string, typeof displayEvents[0]>();
      displayEvents.forEach(e => {
        eventMapForRender.set(e.id, {
          ...e,
          qrCode: e.qrCode ?? qrCodeMapRef.current.get(e.id),
        });
      });

      // Determine active card index: use manual selection if in manual mode, otherwise kiosk selection
      const activeCardIndex = isManualMode && manuallySelectedIndex !== undefined
        ? manuallySelectedIndex
        : selectedArticleIndex;

      // Get the sentiment of the active article (if any) for glow border color
      const activeSentiment = activeCardIndex !== undefined && activeCardIndex >= 0 && activeCardIndex < positionedEvents.length
        ? positionedEvents[activeCardIndex]?.sentiment ?? 0
        : 0;

      // Show glow border if enabled AND (kiosk mode showing article OR manual mode with selection)
      const showGlowBorder = isGlowBorderEnabled && (
        (isKioskModeEnabled && kioskMode === 'article' && !isManualMode) ||
        (isManualMode && manuallySelectedIndex !== undefined)
      );

      renderer.renderFrame({
        ctx,
        viewport,
        nodes,
        axisRows,
        axisColumns,
        metrics: layoutMetrics,
        bounds: layoutBounds,
        isLODEnabled,
        failedImages: failedImagesRef.current,
        layoutMode,
        eventMap: eventMapForRender,
        showDebug: showDebugPanel,
        activeCardIndex,
        isKioskMode: showGlowBorder,
        activeSentiment,
        showCompactAxis,
      });

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    setTimeout(() => {
      setIsLoading(false);
    }, 1000);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [displayEvents, axisRows, axisColumns, layoutMetrics, layoutBounds, kioskMode, articlesViewedCount, selectedArticleIndex, isLODEnabled, isKioskModeEnabled, isGlowBorderEnabled, is3DMode, isHighResEnabled, viewportMode, positionedEvents, showDebugPanel, showCompactAxis, isManualMode, manuallySelectedIndex]);

  return (
    <div className="app-container">
      {/* Debug Panel - Toggle with F9 */}
      {showDebugPanel && (
      <div style={{
        position: 'fixed',
        top: '10px',
        left: '10px',
        background: 'rgba(0, 0, 0, 0.85)',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: '8px',
        fontFamily: 'monospace',
        fontSize: '12px',
        lineHeight: '1.6',
        zIndex: 9999,
        pointerEvents: 'auto',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        <div style={{ marginBottom: '8px', fontWeight: 'bold', fontSize: '13px' }}>Debug Panel (F9 to hide)</div>
        <div>F1: 3D Mode {is3DMode ? '✅' : '❌'}</div>
        <div>F2: LOD {isLODEnabled ? '✅' : '❌'}</div>
        <div>F3: Kiosk {isKioskModeEnabled ? '✅' : '❌'}</div>
        {isKioskModeEnabled && (
          <div style={{ marginLeft: '12px', marginTop: '4px', marginBottom: '4px' }}>
            <button
              onClick={() => setKioskStrategy(kioskStrategy === 'random' ? 'sequential' : 'random')}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                background: kioskStrategy === 'sequential' ? '#8b5cf6' : '#3b82f6',
                color: '#fff',
                fontWeight: 'bold',
              }}
            >
              {kioskStrategy === 'random' ? '🎲 Random' : '📋 Sequential'}
            </button>
            <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '8px' }}>
              {kioskStrategy === 'random' ? '(8 vor Overview)' : '(alle → Overview → repeat)'}
            </span>
          </div>
        )}
        <div>F4: High-Res {isHighResEnabled ? '✅' : '❌'}</div>
        <div>F6: SciFi Dashboard {showSciFiDashboard ? '✅' : '❌'}</div>
        <div>F10: Card Style 🎨 {cardStyle}</div>
        <div>F11: Glow Border {isGlowBorderEnabled ? '✅' : '❌'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
          <span>F12: Min 2/Spalte</span>
          <input
            type="checkbox"
            checked={isMinGroupingEnabled}
            onChange={(e) => {
              setIsMinGroupingEnabled(e.target.checked);
              console.log(`[Min Grouping] ${e.target.checked ? 'ENABLED (min 2 per column)' : 'DISABLED (1 per column allowed)'}`);
            }}
            style={{ cursor: 'pointer' }}
          />
          <span style={{ fontSize: '10px', opacity: 0.6 }}>
            {isMinGroupingEnabled ? '(einzelne → nächste)' : '(1 pro Tag OK)'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
          <span>Compact Achse (LOD)</span>
          <input
            type="checkbox"
            checked={showCompactAxis}
            onChange={(e) => setShowCompactAxis(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <span style={{ fontSize: '10px', opacity: 0.6 }}>
            {showCompactAxis ? '(vertikale Daten)' : '(Detail blendet aus)'}
          </span>
        </div>

        {/* Filters Section */}
        <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: '8px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>Filters</div>

          {/* Hero Image Only */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <input
              type="checkbox"
              id="heroImageOnly"
              checked={heroImageOnly}
              onChange={(e) => setHeroImageOnly(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="heroImageOnly" style={{ cursor: 'pointer', fontSize: '11px' }}>
              Nur Hero-Bilder (keine Screenshots)
            </label>
          </div>

          {/* Sentiment Filter */}
          <div style={{ fontSize: '11px', marginTop: '6px' }}>
            <span style={{ opacity: 0.8 }}>Sentiment:</span>
            <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
              {(['all', 'positive', 'neutral', 'negative'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setSentimentFilter(filter)}
                  style={{
                    padding: '3px 8px',
                    fontSize: '10px',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    background: sentimentFilter === filter
                      ? filter === 'positive' ? '#22c55e'
                        : filter === 'negative' ? '#ef4444'
                        : filter === 'neutral' ? '#6b7280'
                        : '#3b82f6'
                      : 'rgba(255,255,255,0.1)',
                    color: sentimentFilter === filter ? '#fff' : 'rgba(255,255,255,0.7)',
                    fontWeight: sentimentFilter === filter ? 'bold' : 'normal',
                  }}
                >
                  {filter === 'all' ? 'Alle' : filter === 'positive' ? '😊 Positiv' : filter === 'negative' ? '😠 Negativ' : '😐 Neutral'}
                </button>
              ))}
            </div>
          </div>

          {/* Event Count */}
          <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '8px' }}>
            Anzeige: {displayEvents.length} / {events.length} Events
          </div>
        </div>

        <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: '8px' }}>
          <div style={{ fontWeight: 'bold' }}>Viewport (v1.0.18)</div>
          <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '4px' }}>
            F7 Mode: {viewportMode === 'off' ? '❌ OFF' : viewportMode === 'rectBounds' ? '🔲 RectBounds' : '🎯 SnapToContent'}
          </div>
          <div style={{ fontSize: '11px', opacity: 0.6, marginTop: '2px' }}>
            {viewportMode === 'off' && 'No bounds, free panning/zooming'}
            {viewportMode === 'rectBounds' && 'Translation + Scale bounds'}
            {viewportMode === 'snapToContent' && 'Scale bounds (50×), auto-navigation'}
          </div>
        </div>
        <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: '8px' }}>
          <div style={{ fontWeight: 'bold' }}>Layout</div>
          <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '4px' }}>
            F8: {
              layoutMode === 'dayTimeline' ? '📅 Day Timeline (Landscape)' :
              layoutMode === 'dayTimelinePortrait' ? '📅 Day Timeline (Portrait)' :
              layoutMode === 'singleRow' ? '➡️ Single Row' :
              layoutMode === 'masonryVertical' ? '🧱 Masonry ⬇️' :
              '🧱 Masonry ➡️'
            }
          </div>
        </div>
        <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: '8px' }}>
          <div style={{ fontWeight: 'bold' }}>Real-Time Sync</div>
          <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '4px' }}>
            {isSyncing ? '🔄 Syncing...' : '✅ Idle'}
          </div>
          {lastSyncTime && (
            <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '2px' }}>
              Last: {lastSyncTime.toLocaleTimeString('de-AT')}
            </div>
          )}
          {lastSyncStats && (lastSyncStats.created > 0 || lastSyncStats.updated > 0 || lastSyncStats.deleted > 0) && (
            <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '2px', color: '#4ade80' }}>
              +{lastSyncStats.created} ~{lastSyncStats.updated} -{lastSyncStats.deleted}
            </div>
          )}
        </div>
      </div>
      )}

      {showSciFiDashboard ? (
        <SciFiDashboard />
      ) : (
        <>
          {/* Event Search - only visible in debug mode (F9) */}
          {showDebugPanel && (
            <form className="event-search" onSubmit={handleEventSearch}>
              <input
                ref={searchInputRef}
                type="text"
                name="eventId"
                placeholder="Event ID eingeben…"
                autoComplete="off"
              />
            </form>
          )}
          {isLoading && (
            <div className="loader">
              <div className="spinner"></div>
              <p>Loading Koralmbahn Events...</p>
            </div>
          )}
          
          {/* Scene Container to wrap Canvas and Overlay with same 3D transform */}
          <div 
            className="scene-wrapper"
            style={{
              display: 'block',
              width: '100vw',
              height: '100vh',
              transform: is3DMode ? 'perspective(1200px) rotateX(8deg) rotateY(-3deg)' : 'none',
              transformStyle: is3DMode ? 'preserve-3d' : 'flat',
              transition: 'transform 0.3s ease-out',
              position: 'relative',
              overflow: 'hidden', // Clip anything outside
            }}
          >
            <canvas
              ref={canvasRef}
              className="main-canvas"
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onContextMenu={(e) => e.preventDefault()}
              onWheel={handleUserInteraction}
              style={{
                display: 'block',
                width: '100vw',
                height: '100vh',
                background: 'transparent',
                // Canvas sits at 0,0
                position: 'absolute',
                top: 0,
                left: 0,
                cursor: 'pointer',
              }}
            />
            
          </div>
        </>
      )}
    </div>
  );
}

export default App;
