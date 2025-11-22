import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import './App.css';
import { ViewportTransform, useLODTransitions } from 'arkturian-canvas-engine';
import { LayoutEngine } from 'arkturian-canvas-engine/src/layout/LayoutEngine';
import type { LayoutNode } from 'arkturian-canvas-engine/src/layout/LayoutNode';

import { fetchKoralmEvents } from './api/koralmbahnApi';
import type { CardStyle, KoralmEvent } from './types/koralmbahn';
import QRCode from 'qrcode';
import { useKioskMode } from './hooks/useKioskMode';
import { useManualMode } from './hooks/useManualMode';
import { useImageCache } from './hooks/useImageCache';
import { DayTimelineLayouter, type DayAxisRow, type DayTimelineBounds, type DayTimelineLayouterConfig } from './layouts/DayTimelineLayouter';
import { SingleRowTimelineLayouter, type SingleRowBounds } from './layouts/SingleRowTimelineLayouter';
import { MasonryLayouter } from './layouts/MasonryLayouter';
import { EventCanvasRenderer } from './render/EventCanvasRenderer';
import { CanvasViewportController } from './viewport/CanvasViewportController';
import { SnapToContentController } from './viewport/SnapToContentController';
import SciFiDashboard from './effects/SciFiDashboard/SciFiDashboard';

// Viewport Mode: 3 modes for different border checking behaviors
type ViewportMode = 'off' | 'rectBounds' | 'snapToContent';

// Layout Mode: 4 modes for different layout algorithms
type LayoutMode = 'dayTimeline' | 'singleRow' | 'masonryVertical' | 'masonryHorizontal';

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
      return 'v1'; // Standard cards with image + text
    case 'singleRow':
      return 'v2'; // Alternative card layout
    case 'masonryVertical':
      return 'catalog'; // Compact newspaper/catalog layout with variable height
    case 'masonryHorizontal':
      return 'imageOnly'; // Image-only grid
    default:
      return 'v1';
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<ViewportTransform | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const lastUpdateTimeRef = useRef<number>(0); // Separate timer for update loop
  const dayLayouterRef = useRef(new DayTimelineLayouter());
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
  const [layoutBounds, setLayoutBounds] = useState<DayTimelineBounds | null>(null);
  const [layoutMetrics] = useState<DayTimelineLayouterConfig>(dayLayouterRef.current.getMetrics());
  const [viewportSize, setViewportSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [is3DMode, setIs3DMode] = useState(false); // F1: 3D Mode (Default: OFF)
  const [isLODEnabled, setIsLODEnabled] = useState(true);
  const [isKioskModeEnabled, setIsKioskModeEnabled] = useState(false); // F3: Kiosk Mode (Default: OFF)
  const [isHighResEnabled, setIsHighResEnabled] = useState(true); // F4: HighRes (Default: ON)
  const [showSciFiDashboard, setShowSciFiDashboard] = useState(false); // F6 toggle
  const [viewportMode, setViewportMode] = useState<ViewportMode>('off'); // F7: Viewport Mode (Default: OFF)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('dayTimeline'); // F8: Layout Mode (Default: dayTimeline)
  const [useScreenshotsOnly, setUseScreenshotsOnly] = useState(false); // F9: Screenshots Only (Default: OFF)
  const [cardStyle, setCardStyle] = useState<CardStyle>(getDefaultCardStyleForLayout('dayTimeline')); // F10: Card Style (Auto-set based on layout mode)
  const [useMuseumQR, setUseMuseumQR] = useState(true); // F11: Museum QR Codes (Default: ON - show museum page instead of original article)
  const [qrRenderTrigger, setQrRenderTrigger] = useState(0); // Trigger re-render when QR codes are ready
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Click detection refs (to distinguish clicks from drags)
  const mouseDownPosRef = useRef<{ x: number; y: number; button: number } | null>(null);
  const CLICK_THRESHOLD = 5; // pixels

  // Failed image loads tracking (to prevent endless 404 retries)
  const failedImagesRef = useRef<Set<string>>(new Set());

  // Custom hooks
  const { getImage, loadHighResImage, preloadImages } = useImageCache();
  const { updateLODState } = useLODTransitions();

  // Transform events based on F9 "Screenshots Only" toggle
  const displayEvents = useMemo(() => {
    // qrRenderTrigger is in dependencies to force re-render when QR codes are ready
    if (!useScreenshotsOnly) return events;

    return events.map(event => {
      // Only transform if screenshot exists
      if (event.screenshotUrl) {
        return {
          ...event,
          imageUrl: event.screenshotUrl,
          sourceName: 'Article Screenshot', // Mark as screenshot for top-aligned rendering
        };
      }
      return event;
    });
  }, [events, useScreenshotsOnly, qrRenderTrigger]);

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
    const getExtraHeight = (node: LayoutNode<KoralmEvent>, baseHeight: number): number => {
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
  const { isManualMode, handleCanvasClick, handleCanvasRightClick, handleManualInteraction } = useManualMode({
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
  const { kioskMode, articlesViewedCount } = useKioskMode({
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
        const syntheticEvent = {
          clientX: touch.clientX,
          clientY: touch.clientY,
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

  // Generate QR codes when events or useMuseumQR changes
  useEffect(() => {
    if (events.length === 0) return;

    // Determine base URL for museum article pages
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

    let completedCount = 0;
    const totalCount = events.length;

    events.forEach(async (event) => {
      try {
        // Choose URL based on F11 toggle
        const qrUrl = useMuseumQR
          ? `${baseUrl}/article/${event.id}` // Museum article page
          : event.url; // Original article URL

        const qrDataUrl = await QRCode.toDataURL(qrUrl, {
          width: 80,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });

        const qrImg = new Image();
        qrImg.onload = () => {
          event.qrCode = qrImg;
          completedCount++;

          // Force re-render when all QR codes are ready
          if (completedCount === totalCount) {
            console.log(`[QR Codes] All ${totalCount} QR codes generated (Museum Mode: ${useMuseumQR ? 'ON' : 'OFF'})`);
            setQrRenderTrigger(prev => prev + 1); // Force re-render
          }
        };
        qrImg.src = qrDataUrl;
      } catch (error) {
        console.error(`[App] QR code generation failed for event ${event.id}:`, error);
        completedCount++;
      }
    });
  }, [events, useMuseumQR]);

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
    let bounds: DayTimelineBounds | SingleRowBounds;
    if (layoutMode === 'dayTimeline') {
      const layouter = dayLayouterRef.current;
      setAxisRows(layouter.getAxisRows());
      bounds = layouter.getContentBounds();
    } else if (layoutMode === 'singleRow') {
      setAxisRows([]); // No axis rows in single row mode
      bounds = singleRowLayouterRef.current.getContentBounds();
    } else if (layoutMode === 'masonryVertical') {
      setAxisRows([]); // No axis rows in masonry mode
      bounds = masonryVerticalLayouterRef.current?.getContentBounds() || { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    } else {
      // masonryHorizontal
      setAxisRows([]); // No axis rows in masonry mode
      bounds = masonryHorizontalLayouterRef.current?.getContentBounds() || { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    }

    setLayoutBounds(bounds);

    const nodes = layoutEngine.all();
    const positioned = nodes.map((node) => ({
      ...node.data,
      x: node.posX.value ?? 0,
      y: node.posY.value ?? 0,
      width: node.width.value ?? 0,
      height: node.height.value ?? 0,
    }));
    setPositionedEvents(positioned);
  }, [displayEvents, viewportSize, layoutMode, cardStyle]);

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
        setUseScreenshotsOnly((prev) => {
          console.log(`[Screenshots Only] ${!prev ? 'ENABLED' : 'DISABLED'}`);
          return !prev;
        });
      }
      if (event.key === 'F10') {
        event.preventDefault();
        setCardStyle((prev) => {
          let nextStyle: CardStyle;
          if (prev === 'v1') {
            nextStyle = 'v2';
          } else if (prev === 'v2') {
            nextStyle = 'catalog';
          } else if (prev === 'catalog') {
            nextStyle = 'imageOnly';
          } else {
            nextStyle = 'v1';
          }
          console.log(`[Card Style] Switching: ${prev} → ${nextStyle}`);
          return nextStyle;
        });
      }
      if (event.key === 'F11') {
        event.preventDefault();
        setUseMuseumQR((prev) => {
          console.log(`[Museum QR] ${!prev ? 'ENABLED' : 'DISABLED'} - QR codes will point to ${!prev ? 'museum article pages' : 'original articles'}`);
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
      renderer.renderFrame({
        ctx,
        viewport,
        nodes,
        axisRows,
        metrics: layoutMetrics,
        bounds: layoutBounds,
        kioskMode,
        articlesViewedCount,
        isLODEnabled,
        isKioskModeEnabled,
        is3DMode,
        failedImages: failedImagesRef.current,
        renderDelta,
        updateDelta,
        isHighResEnabled,
        layoutMode,
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
  }, [displayEvents, axisRows, layoutMetrics, layoutBounds, kioskMode, articlesViewedCount, isLODEnabled, isKioskModeEnabled, is3DMode, isHighResEnabled, viewportMode, positionedEvents]);

  return (
    <div className="app-container">
      {/* Debug Panel */}
      <div style={{
        position: 'fixed',
        top: '10px',
        left: '10px',
        background: 'rgba(0, 0, 0, 0.8)',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: '8px',
        fontFamily: 'monospace',
        fontSize: '12px',
        lineHeight: '1.6',
        zIndex: 9999,
        pointerEvents: 'none',
      }}>
        <div style={{ marginBottom: '8px', fontWeight: 'bold', fontSize: '13px' }}>Debug Panel</div>
        <div>F1: 3D Mode {is3DMode ? '✅' : '❌'}</div>
        <div>F2: LOD {isLODEnabled ? '✅' : '❌'}</div>
        <div>F3: Kiosk {isKioskModeEnabled ? '✅' : '❌'}</div>
        <div>F4: High-Res {isHighResEnabled ? '✅' : '❌'}</div>
        <div>F6: SciFi Dashboard {showSciFiDashboard ? '✅' : '❌'}</div>
        <div>F9: Screenshots Only {useScreenshotsOnly ? '✅' : '❌'}</div>
        <div>F10: Card Style 🎨 {cardStyle}</div>
        <div>F11: Museum QR {useMuseumQR ? '✅' : '❌'}</div>
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
              layoutMode === 'dayTimeline' ? '📅 Day Timeline' :
              layoutMode === 'singleRow' ? '➡️ Single Row' :
              layoutMode === 'masonryVertical' ? '🧱 Masonry ⬇️' :
              '🧱 Masonry ➡️'
            }
          </div>
        </div>
      </div>

      {showSciFiDashboard ? (
        <SciFiDashboard />
      ) : (
        <>
          <form className="event-search" onSubmit={handleEventSearch}>
            <input
              ref={searchInputRef}
              type="text"
              name="eventId"
              placeholder="Event ID eingeben…"
              autoComplete="off"
            />
          </form>
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
                background: '#f5f5f5',
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
