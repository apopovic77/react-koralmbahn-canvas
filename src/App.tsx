import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import './App.css';
import { ViewportTransform, useLODTransitions, RectBoundsStrategy, NoBoundsStrategy } from 'arkturian-canvas-engine';
import { LayoutEngine } from 'arkturian-canvas-engine/src/layout/LayoutEngine';

type ViewportMode = 'rectBounds' | 'snapToContent' | 'off';

import { fetchKoralmEvents } from './api/koralmbahnApi';
import type { KoralmEvent } from './types/koralmbahn';
import QRCode from 'qrcode';
import { useKioskMode } from './hooks/useKioskMode';
import { useManualMode } from './hooks/useManualMode';
import { useImageCache } from './hooks/useImageCache';
import { DayTimelineLayouter, type DayAxisRow, type DayTimelineBounds, type DayTimelineLayouterConfig } from './layouts/DayTimelineLayouter';
import { EventCanvasRenderer } from './render/EventCanvasRenderer';
import { CanvasViewportController } from './viewport/CanvasViewportController';
import { SnapToContentController } from './viewport/SnapToContentController';
import { ElectricBorder } from './effects/ElectricBorder/ElectricBorder';
import SciFiDashboard from './effects/SciFiDashboard/SciFiDashboard';

const PADDING = 15;

// Performance settings (game engine pattern)
const RENDER_FPS = 60; // Visual rendering at 60 FPS for smooth animations
const UPDATE_FPS = 25; // Logic updates (culling, LOD) at 25 FPS for performance

// Image LOD (Level of Detail) threshold
const IMAGE_LOD_THRESHOLD = 1.5; // Above this zoom: use high-res images, below: use thumbnails

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<ViewportTransform | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const lastUpdateTimeRef = useRef<number>(0); // Separate timer for update loop
  const dayLayouterRef = useRef(new DayTimelineLayouter());
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
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const selectedEventOverlayRef = useRef<HTMLDivElement>(null);

  // Click detection refs (to distinguish clicks from drags)
  const mouseDownPosRef = useRef<{ x: number; y: number; button: number } | null>(null);
  const CLICK_THRESHOLD = 5; // pixels

  // Failed image loads tracking (to prevent endless 404 retries)
  const failedImagesRef = useRef<Set<string>>(new Set());

  // Custom hooks
  const { getImage, loadHighResImage, preloadImages } = useImageCache();
  const { updateLODState } = useLODTransitions();

  useEffect(() => {
    rendererRef.current = new EventCanvasRenderer({
      padding: PADDING,
      imageLODThreshold: IMAGE_LOD_THRESHOLD,
      getImage,
      loadHighResImage,
      updateLODState,
      enableHighResFetch: isHighResEnabled,
    });
  }, [getImage, loadHighResImage, updateLODState, isHighResEnabled]);

  // Manual mode hook
  const { isManualMode, handleCanvasClick, handleCanvasRightClick, handleManualInteraction } = useManualMode({
    viewport: viewportRef.current,
    events: positionedEvents,
    canvasWidth: window.innerWidth,
    canvasHeight: window.innerHeight,
    isKioskModeEnabled,
    onEventSelected: (event) => setSelectedEventId(event?.id || null),
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
    
    // Also select it
    setSelectedEventId(match.data.id);
    
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

      data.forEach(async (event) => {
        try {
          const qrDataUrl = await QRCode.toDataURL(event.url, {
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
          };
          qrImg.src = qrDataUrl;
        } catch (error) {
          console.error(`[App] QR code generation failed for event ${event.id}:`, error);
        }
      });
    }

    loadEvents();
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

    // Apply border check strategy based on viewport mode
    if (viewportMode === 'rectBounds') {
      viewport.setBorderCheckStrategy(new RectBoundsStrategy());
      console.log('[ViewportMode] Applied RectBoundsStrategy (rubber banding)');
    } else {
      viewport.setBorderCheckStrategy(new NoBoundsStrategy());
      console.log('[ViewportMode] Applied NoBoundsStrategy (free panning)');
    }

    return () => {
      controller.destroy();
      viewportRef.current = null;
    };
  }, [viewportMode]);

  useEffect(() => {
    viewportControllerRef.current.updateBounds(layoutBounds, positionedEvents);
  }, [layoutBounds, positionedEvents]);

  useEffect(() => {
    const layoutEngine = layoutEngineRef.current;
    layoutEngine.sync(events, (event) => event.id);
    layoutEngine.layout(viewportSize);

    const layouter = dayLayouterRef.current;
    setAxisRows(layouter.getAxisRows());
    const bounds = layouter.getContentBounds();
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
  }, [events, viewportSize]);

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
          const modes: ViewportMode[] = ['off', 'rectBounds', 'snapToContent'];
          const currentIndex = modes.indexOf(prev);
          const nextIndex = (currentIndex + 1) % modes.length;
          const nextMode = modes[nextIndex];
          console.log(`[Viewport Mode] Switching to: ${nextMode}`);
          return nextMode;
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
      });

      // Update selection overlay position
      if (selectedEventId && selectedEventOverlayRef.current && positionedEvents.length > 0) {
        const event = positionedEvents.find(e => e.id === selectedEventId);
        if (event && event.width && event.height) {
          // viewport.scale and offset are available on the viewport object
          const scale = viewport.scale;
          const offsetX = viewport.offset.x;
          const offsetY = viewport.offset.y;
          
          const screenX = (event.x || 0) * scale + offsetX;
          const screenY = (event.y || 0) * scale + offsetY;
          const screenWidth = event.width * scale;
          const screenHeight = event.height * scale;

          const el = selectedEventOverlayRef.current;
          el.style.transform = `translate(${screenX}px, ${screenY}px)`;
          el.style.width = `${screenWidth}px`;
          el.style.height = `${screenHeight}px`;
          el.style.display = 'block';
        } else {
          if (selectedEventOverlayRef.current) selectedEventOverlayRef.current.style.display = 'none';
        }
      } else if (selectedEventOverlayRef.current) {
        selectedEventOverlayRef.current.style.display = 'none';
      }

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
  }, [events, axisRows, layoutMetrics, layoutBounds, kioskMode, articlesViewedCount, isLODEnabled, isKioskModeEnabled, is3DMode, isHighResEnabled, viewportMode, positionedEvents, selectedEventId]);

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
        <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: '8px' }}>
          <div style={{ fontWeight: 'bold' }}>F7: Viewport Mode</div>
          <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '4px' }}>
            {viewportMode === 'off' && '❌ Off (Free Panning)'}
            {viewportMode === 'rectBounds' && '✅ Rect Bounds (Rubber Band)'}
            {viewportMode === 'snapToContent' && '✅ Snap-to-Content (Auto-Nav)'}
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
            
            {/* Overlay for ElectricBorder */}
            <div
              ref={selectedEventOverlayRef}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                pointerEvents: 'none',
                display: 'none',
                zIndex: 10,
                // We do NOT apply the 3D transform here again, because we are inside the transformed wrapper
                // However, the canvas uses 100vw/100vh and transforms.
                // If we position absolutely inside the wrapper, we are in the same coordinate space as the canvas *element*.
                // The canvas content is drawn in 2D, but the whole plane is rotated.
                // So our 2D translation on the overlay should match the 2D content on the canvas surface.
              }}
            >
              <ElectricBorder />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
