import { useEffect, useRef, useState } from 'react';
import './App.css';
import { ViewportTransform, useLODTransitions } from 'arkturian-canvas-engine';
import { fetchKoralmEvents } from './api/koralmbahnApi';
import type { KoralmEvent } from './types/koralmbahn';
import QRCode from 'qrcode';
import { useKioskMode } from './hooks/useKioskMode';
import { useManualMode } from './hooks/useManualMode';
import { useImageCache } from './hooks/useImageCache';

// Card dimensions (magazine-style layout with wrapped text)
const BASE_CARD_WIDTH = 250;
const BASE_CARD_HEIGHT = 350;
const CARD_ASPECT_RATIO = BASE_CARD_HEIGHT / BASE_CARD_WIDTH; // 1.4
const PADDING = 15;
const CARD_GAP = 30;

// Performance settings (game engine pattern)
const RENDER_FPS = 60; // Visual rendering at 60 FPS for smooth animations
const UPDATE_FPS = 25; // Logic updates (culling, LOD) at 25 FPS for performance

// Adaptive grid layout configuration
interface GridLayout {
  cols: number;
  rows: number;
  cardWidth: number;
  cardHeight: number;
}

function calculateOptimalGrid(
  eventCount: number,
  viewportWidth: number,
  _viewportHeight: number
): GridLayout {
  if (eventCount === 0) {
    return { cols: 1, rows: 1, cardWidth: BASE_CARD_WIDTH, cardHeight: BASE_CARD_HEIGHT };
  }

  // Use BASE_CARD_WIDTH as target size and calculate columns
  const cols = Math.max(1, Math.floor((viewportWidth + CARD_GAP) / (BASE_CARD_WIDTH + CARD_GAP)));
  const rows = Math.ceil(eventCount / cols);

  // ProductFinder formula: cellLen = (frameWidth - spacing * (cols - 1)) / cols
  const cardWidth = (viewportWidth - CARD_GAP * (cols - 1)) / cols;
  const cardHeight = cardWidth * CARD_ASPECT_RATIO;

  return {
    cols,
    rows,
    cardWidth: Math.floor(cardWidth),
    cardHeight: Math.floor(cardHeight)
  };
}

// Image LOD (Level of Detail) threshold
const IMAGE_LOD_THRESHOLD = 1.5; // Above this zoom: use high-res images, below: use thumbnails

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<ViewportTransform | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const lastUpdateTimeRef = useRef<number>(0); // Separate timer for update loop
  const cullingRef = useRef<ViewportCulling | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [events, setEvents] = useState<KoralmEvent[]>([]);
  const [is3DMode, setIs3DMode] = useState(true);
  const [isLODEnabled, setIsLODEnabled] = useState(true);
  const [isKioskModeEnabled, setIsKioskModeEnabled] = useState(true);

  // Click detection refs (to distinguish clicks from drags)
  const mouseDownPosRef = useRef<{ x: number; y: number; button: number } | null>(null);
  const CLICK_THRESHOLD = 5; // pixels

  // Failed image loads tracking (to prevent endless 404 retries)
  const failedImagesRef = useRef<Set<string>>(new Set());

  // Custom hooks
  const { getImage, loadHighResImage, preloadImages } = useImageCache();
  const { updateLODState } = useLODTransitions();

  // Manual mode hook
  const { isManualMode, handleCanvasClick, handleCanvasRightClick, handleManualInteraction } = useManualMode({
    viewport: viewportRef.current,
    events,
    canvasWidth: window.innerWidth,
    canvasHeight: window.innerHeight,
    isKioskModeEnabled,
  });

  // Kiosk mode hook
  const { kioskMode, articlesViewedCount } = useKioskMode({
    viewport: viewportRef.current,
    events,
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

  // Load events on mount
  useEffect(() => {
    async function loadEvents() {
      console.log('[App] Loading Koralmbahn events...');
      const data = await fetchKoralmEvents(300);

      // Calculate optimal grid layout based on viewport size
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const gridLayout = calculateOptimalGrid(data.length, viewportWidth, viewportHeight);

      console.log(`[App] Calculated grid: ${gridLayout.cols} cols × ${gridLayout.rows} rows, ` +
                  `card size: ${gridLayout.cardWidth.toFixed(0)}×${gridLayout.cardHeight.toFixed(0)}`);

      // Position events in a grid layout (full screen usage)
      const positioned = data.map((event, index) => {
        const col = index % gridLayout.cols;
        const row = Math.floor(index / gridLayout.cols);
        const cardStyle = 'v2'; // Use v2 style for all cards

        // Use ProductFinder spacing formula
        const x = col * (gridLayout.cardWidth + CARD_GAP);
        const y = row * (gridLayout.cardHeight + CARD_GAP);

        return {
          ...event,
          x,
          y,
          width: gridLayout.cardWidth,
          height: gridLayout.cardHeight,
          cardStyle,
        };
      });

      setEvents(positioned as KoralmEvent[]);
      console.log(`[App] Loaded ${positioned.length} events`);

      // Preload low-res images using IndexedDB cache
      await preloadImages(positioned as KoralmEvent[]);

      // Generate QR codes for events
      positioned.forEach(async (event) => {
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
            console.log(`[App] QR code generated for event: ${event.id}`);
          };
          qrImg.src = qrDataUrl;
        } catch (error) {
          console.error(`[App] QR code generation failed for event ${event.id}:`, error);
        }
      });
    }

    loadEvents();
  }, []);

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
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas size
    const updateCanvasSize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);

    // Initialize viewport transform (zoom/pan)
    const viewport = new ViewportTransform(canvas);
    viewportRef.current = viewport;

    // Calculate content bounds based on actual event positions
    let minX = 0, minY = 0, maxX = window.innerWidth, maxY = window.innerHeight;

    if (events.length > 0) {
      minX = Infinity;
      minY = Infinity;
      maxX = -Infinity;
      maxY = -Infinity;

      events.forEach(event => {
        if (event.x !== undefined && event.y !== undefined && event.width && event.height) {
          minX = Math.min(minX, event.x);
          minY = Math.min(minY, event.y);
          maxX = Math.max(maxX, event.x + event.width);
          maxY = Math.max(maxY, event.y + event.height);
        }
      });

      // Add small padding (just gap size) to prevent clipping
      minX = Math.max(0, minX - CARD_GAP);
      minY = Math.max(0, minY - CARD_GAP);
      maxX += CARD_GAP;
      maxY += CARD_GAP;
    }

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    // Don't set maxItemHeight to allow extreme zoom levels (uses fallback: fitToContentScale * 200)
    viewport.setContentBounds({
      width: contentWidth,
      height: contentHeight,
      minX: minX,
      minY: minY,
      maxX: maxX,
      maxY: maxY,
    });

    // Initialize viewport culling (once, reused every frame)
    cullingRef.current = new ViewportCulling(
      viewportRef.current,
      window.innerWidth,
      window.innerHeight
    );

    // Game engine pattern: separate render and update loops
    const renderInterval = 1000 / RENDER_FPS; // 16.67ms for 60 FPS
    const updateInterval = 1000 / UPDATE_FPS; // 40ms for 25 FPS

    // Animation loop with dual FPS (like professional game engines)
    const render = (currentTime: number) => {
      if (!viewportRef.current || !cullingRef.current) return;

      // RENDER LOOP (60 FPS): Calculate render delta
      const renderDelta = currentTime - lastFrameTimeRef.current;
      if (renderDelta < renderInterval) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }
      lastFrameTimeRef.current = currentTime - (renderDelta % renderInterval);

      // UPDATE LOOP (25 FPS): Heavy operations (culling, LOD)
      const updateDelta = currentTime - lastUpdateTimeRef.current;
      const shouldUpdate = updateDelta >= updateInterval;
      if (shouldUpdate) {
        lastUpdateTimeRef.current = currentTime - (updateDelta % updateInterval);
      }

      // Always update viewport (smooth interpolation at 60 FPS)
      viewportRef.current.update();

      // Clear canvas
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Apply viewport transform
      ctx.save();
      viewportRef.current.applyTransform(ctx);

      // Image LOD (Level of Detail) - always available for rendering
      const currentScale = viewportRef.current.scale;
      const useHighRes = currentScale >= IMAGE_LOD_THRESHOLD;

      // UPDATE LOOP (25 FPS): Update culling bounds only when needed
      if (shouldUpdate) {
        cullingRef.current.updateBounds();
        cullingRef.current.resetStats();
      }
      const culling = cullingRef.current;

      // Draw event cards (with intelligent viewport culling)
      events.forEach((event) => {
        if (!event.x || !event.y || !event.width || !event.height) return;

        const { x, y, width, height } = event;

        // Skip cards that are not visible in viewport
        if (!culling.isVisible({ x, y, width, height })) {
          culling.incrementCulled();
          return;
        }

        culling.incrementRendered();

        // Load high-res image ONLY for visible events when zoomed in
        // Skip if this URL has already failed to load
        if (useHighRes && event.imageUrl && !failedImagesRef.current.has(event.imageUrl)) {
          // Detect existing format from URL to preserve it (important for SVG->PNG conversions)
          const urlObj = new URL(event.imageUrl);
          const existingFormat = urlObj.searchParams.get('format');

          // Build high-res config that respects existing format
          const highResConfig = {
            width: 800,
            format: existingFormat || 'jpg', // Keep existing format (png for SVGs, jpg otherwise)
            quality: 90,
          };

          loadHighResImage(event.imageUrl, highResConfig).then((img) => {
            if (!img) {
              // Remember failed loads to prevent repeated 404 requests every frame
              failedImagesRef.current.add(event.imageUrl!);
              console.log(`[ImageCache] Marking ${event.imageUrl} as failed - will not retry`);
            }
          });
        }

        // Calculate screen-space size for card LOD and update transition state
        const screenCardWidth = width * currentScale;
        const transitionState = isLODEnabled
          ? updateLODState(event.id, screenCardWidth)
          : { imageHeightPercent: 1.0, textOpacity: 1.0 };

        // Get image based on LOD
        const img = event.imageUrl ? getImage(event.imageUrl, useHighRes) : null;

        // ===== UNIFIED RENDERING WITH INTERPOLATED TRANSITIONS =====
        // Always render card background and border
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - 5, y - 5, width + 10, height + 10);
        ctx.clip();

        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;
        ctx.fillRect(x, y, width, height);

        ctx.restore();

        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, width, height);

        // Draw image with interpolated height
        const imageX = x;
        const imageY = y;
        const imageWidth = width;
        const imageHeight = Math.floor(height * transitionState.imageHeightPercent);

        if (img && img.complete) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(imageX, imageY, imageWidth, imageHeight);
          ctx.clip();

          // Calculate aspect ratio fit (cover mode)
          const imgAspect = img.width / img.height;
          const targetAspect = imageWidth / imageHeight;
          let drawWidth = imageWidth;
          let drawHeight = imageHeight;
          let offsetX = 0;
          let offsetY = 0;

          if (imgAspect > targetAspect) {
            drawHeight = imageHeight;
            drawWidth = imageHeight * imgAspect;
            offsetX = -(drawWidth - imageWidth) / 2;
          } else {
            drawWidth = imageWidth;
            drawHeight = imageWidth / imgAspect;
            offsetY = -(drawHeight - imageHeight) / 2;
          }

          ctx.drawImage(img, imageX + offsetX, imageY + offsetY, drawWidth, drawHeight);
          ctx.restore();
        } else {
          ctx.fillStyle = '#e0e0e0';
          ctx.fillRect(imageX, imageY, imageWidth, imageHeight);
        }

        // Render text with interpolated opacity (only if opacity > 0.01)
        if (transitionState.textOpacity > 0.01) {
          ctx.globalAlpha = transitionState.textOpacity;

          // Text rendering below image (V2 style layout)
          const textStartY = imageY + imageHeight + PADDING;
          const textStartX = x + PADDING;
          const textWidth = width - PADDING * 2;

          // Title
          ctx.fillStyle = '#1a1a1a';
          ctx.font = 'bold 13px sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          const titleLines = wrapText(ctx, event.title, textWidth, 13);
          const maxTitleLines = Math.min(2, titleLines.length);
          let textY = textStartY;
          titleLines.slice(0, maxTitleLines).forEach((line, i) => {
            ctx.fillText(line, textStartX, textY + i * 16);
          });
          textY += maxTitleLines * 16 + 6;

          // Subtitle
          if (event.subtitle || event.sourceName) {
            ctx.fillStyle = '#666';
            ctx.font = '10px sans-serif';
            const subtitleText = event.subtitle || event.sourceName || '';
            const subtitleLines = wrapText(ctx, subtitleText, textWidth, 10);
            if (subtitleLines.length > 0) {
              ctx.fillText(subtitleLines[0], textStartX, textY);
              textY += 14;
            }
          }

          // Summary (with ellipsis if needed)
          ctx.fillStyle = '#444';
          ctx.font = '11px sans-serif';
          const summaryLines = wrapText(ctx, event.summary, textWidth, 11);
          const maxSummaryLines = 3;
          summaryLines.slice(0, maxSummaryLines).forEach((line, i) => {
            const displayLine =
              i === maxSummaryLines - 1 && summaryLines.length > maxSummaryLines
                ? line + '...'
                : line;
            ctx.fillText(displayLine, textStartX, textY + i * 14);
          });
          textY += maxSummaryLines * 14 + 8;

          // Event ID & URL (Developer info)
          ctx.fillStyle = '#999';
          ctx.font = '9px monospace';
          ctx.fillText(`ID: ${event.id}`, textStartX, textY);
          textY += 12;

          // URL (truncated if too long)
          const maxUrlWidth = textWidth;
          let displayUrl = event.url;
          if (ctx.measureText(displayUrl).width > maxUrlWidth) {
            // Truncate URL from middle
            const urlParts = displayUrl.split('/');
            displayUrl = urlParts[0] + '//' + urlParts[2] + '/.../' + urlParts[urlParts.length - 1];
            if (ctx.measureText(displayUrl).width > maxUrlWidth) {
              displayUrl = displayUrl.substring(0, 30) + '...';
            }
          }
          ctx.fillStyle = '#0066cc';
          ctx.fillText(displayUrl, textStartX, textY);

          // QR Code (fades with text, in bottom right corner)
          if (event.qrCode && event.qrCode.complete) {
            const qrSize = 60;
            const qrX = x + width - qrSize - 8;
            const qrY = y + height - qrSize - 8;

            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 2;
            ctx.fillStyle = '#fff';
            ctx.fillRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8);
            ctx.restore();

            ctx.drawImage(event.qrCode, qrX, qrY, qrSize, qrSize);
          }

          // Reset global alpha
          ctx.globalAlpha = 1.0;
        }
      });

      ctx.restore();

      // Draw UI overlay (not affected by viewport transform)
      const stats = culling.getStats();
      const efficiency = culling.getEfficiency();

      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(10, 10, 450, 150);
      ctx.fillStyle = '#fff';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Koralmbahn Events Canvas', 20, 30);
      const modeText = kioskMode === 'overview'
        ? 'Overview'
        : `Article ${articlesViewedCount}/5`;
      ctx.fillText(
        `Events: ${events.length} | Mode: ${modeText} | Image: ${useHighRes ? 'HIGH-RES' : 'THUMBNAIL'}`,
        20,
        50
      );
      ctx.fillText(
        `Zoom: ${(viewportRef.current.scale * 100).toFixed(0)}% | Pan: ${Math.round(viewportRef.current.offset.x)}, ${Math.round(viewportRef.current.offset.y)}`,
        20,
        70
      );
      ctx.fillText(
        `Culling: ${stats.rendered} rendered / ${stats.culled} culled (${efficiency.toFixed(1)}% efficiency)`,
        20,
        90
      );
      const actualRenderFPS = renderDelta > 0 ? Math.round(1000 / renderDelta) : 0;
      const actualUpdateFPS = updateDelta > 0 ? Math.round(1000 / updateDelta) : 0;
      ctx.fillText(
        `Render: ${actualRenderFPS}/${RENDER_FPS} FPS | Update: ${actualUpdateFPS}/${UPDATE_FPS} FPS | Frame: ${renderDelta.toFixed(1)}ms`,
        20,
        110
      );
      ctx.fillText(
        'Mouse wheel = zoom | Right-click drag = pan',
        20,
        130
      );

      // F-key controls
      ctx.fillText(
        `F1: ${is3DMode ? '3D Mode' : '2D Mode'} | F2: LOD ${isLODEnabled ? 'ON' : 'OFF'} | F3: Kiosk ${isKioskModeEnabled ? 'ON' : 'OFF'}`,
        20,
        150
      );

      animationFrameRef.current = requestAnimationFrame(render);
    };

    // Start render loop
    animationFrameRef.current = requestAnimationFrame(render);

    // Simulate loading
    setTimeout(() => {
      setIsLoading(false);
    }, 1000);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      viewport.destroy();
      window.removeEventListener('resize', updateCanvasSize);
    };
  }, [events]);

  return (
    <div className="app-container">
      {isLoading && (
        <div className="loader">
          <div className="spinner"></div>
          <p>Loading Koralmbahn Events...</p>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="main-canvas"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={handleManualInteraction}
        onTouchStart={handleManualInteraction}
        style={{
          display: 'block',
          width: '100vw',
          height: '100vh',
          background: '#f5f5f5',
          transform: is3DMode ? 'perspective(1200px) rotateX(8deg) rotateY(-3deg)' : 'none',
          transformStyle: is3DMode ? 'preserve-3d' : 'flat',
          cursor: 'pointer',
          transition: 'transform 0.3s ease-out',
        }}
      />
    </div>
  );
}

// Helper function to wrap text
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  _fontSize: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  words.forEach((word) => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

export default App;
