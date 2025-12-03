/**
 * EventCanvasRenderer - Main renderer for Koralmbahn event canvas
 *
 * Responsibilities:
 * - Viewport culling (only render visible cards)
 * - High-resolution image loading
 * - LOD (Level of Detail) transitions
 * - Axis and overlay rendering
 * - Delegates card rendering to Card classes
 */

import type { ViewportTransform, HighResImageConfig } from 'arkturian-canvas-engine';
import type { LayoutNode } from 'arkturian-canvas-engine/src/layout/LayoutNode';

import type { KoralmEvent } from '../types/koralmbahn';
import type { DayAxisRow, DayTimelineBounds, DayTimelineLayouterConfig } from '../layouts/DayTimelineLayouter';
import type { DayAxisColumn, DayTimelinePortraitBounds } from '../layouts/DayTimelinePortraitLayouter';

// Import new card system
import {
  CardFactory,
  type CardFactoryConfig,
  type AspectRatio,
  type CardStyleType,
} from './cards';

// Import glow border effect
import { GlowBorder } from './effects/GlowBorder';

// Import sentiment lines effect
import { SentimentLinesRenderer } from './effects/SentimentLines';

export interface EventCanvasRendererOptions {
  padding: number;
  imageLODThreshold: number;
  getImage: (url: string, useHighRes: boolean) => HTMLImageElement | null;
  loadHighResImage: (url: string, config?: HighResImageConfig) => Promise<HTMLImageElement | null>;
  updateLODState: (itemId: string, screenCardWidth: number) => { imageHeightPercent: number; textOpacity: number };
  enableHighResFetch: boolean;

  /** Card factory configuration (optional) */
  cardFactoryConfig?: Partial<CardFactoryConfig>;
}

interface RenderFrameParams {
  ctx: CanvasRenderingContext2D;
  viewport: ViewportTransform;
  nodes: LayoutNode<KoralmEvent>[];
  axisRows: DayAxisRow[];
  axisColumns?: DayAxisColumn[];
  metrics: DayTimelineLayouterConfig | null;
  bounds: DayTimelineBounds | DayTimelinePortraitBounds | null;
  isLODEnabled: boolean;
  failedImages: Set<string>;
  layoutMode: 'dayTimeline' | 'dayTimelinePortrait' | 'singleRow' | 'masonryVertical' | 'masonryHorizontal';
  /** Optional map of current event data (with QR codes) to override stale node.data */
  eventMap?: Map<string, KoralmEvent>;
  /** Show debug info on cards (synced with F9 debug panel) */
  showDebug?: boolean;
  /** Index of currently active kiosk card (for glow border) */
  activeCardIndex?: number;
  /** Whether kiosk mode is active */
  isKioskMode?: boolean;
  /** Sentiment of the active article (-1 to +1) for glow border color */
  activeSentiment?: number | null;
  /** Whether to show compact axis mode when zoomed out (default: true) */
  showCompactAxis?: boolean;
  /** Always show sentiment lines regardless of zoom level (default: true) */
  alwaysShowSentimentLines?: boolean;
}

export class EventCanvasRenderer {
  private readonly options: EventCanvasRendererOptions;
  private highResInFlight = new Set<string>();
  private cardFactory: CardFactory;
  private glowBorder: GlowBorder;
  private sentimentLines: SentimentLinesRenderer;
  private lastFrameTime: number = 0;

  constructor(options: EventCanvasRendererOptions) {
    this.options = options;

    // Initialize card factory with provided config or defaults
    this.cardFactory = new CardFactory(options.cardFactoryConfig || {
      aspectRatio: '4:3',
      defaultStyle: 'overlay', // Default to overlay (imageOnly) style
      baseConfig: {
        padding: options.padding,
      },
    });

    // Initialize glow border effect for active kiosk card
    this.glowBorder = new GlowBorder({
      color: 'rgba(255, 255, 255, 0.95)',
      secondaryColor: 'rgba(100, 180, 255, 0.6)',
      width: 3,
      trailLength: 0.45,
      blur: 18,
      speed: 0.15,
      borderRadius: 5,
    });

    // Initialize sentiment lines renderer
    this.sentimentLines = new SentimentLinesRenderer();
  }

  /**
   * Update card factory configuration
   */
  setCardFactoryConfig(config: Partial<CardFactoryConfig>): void {
    this.cardFactory = this.cardFactory.withConfig(config);
  }

  /**
   * Set card aspect ratio
   */
  setAspectRatio(aspectRatio: AspectRatio): void {
    this.cardFactory = this.cardFactory.withAspectRatio(aspectRatio);
  }

  /**
   * Set default card style
   */
  setDefaultCardStyle(style: CardStyleType): void {
    this.cardFactory = this.cardFactory.withDefaultStyle(style);
  }

  /**
   * Get current card factory
   */
  getCardFactory(): CardFactory {
    return this.cardFactory;
  }

  /**
   * Detect if an event is a Playwright/PDF screenshot using API markers
   */
  private isScreenshot(event: KoralmEvent): boolean {
    return !!(
      (event.sourceName?.includes('Screenshot')) ||
      (event.imageUrl?.includes('#screenshot')) ||
      (event.imageUrl?.toLowerCase().includes('playwright')) ||
      (event.imageUrl?.toLowerCase().includes('screenshot'))
    );
  }

  renderFrame(params: RenderFrameParams): void {
    const {
      ctx,
      viewport,
      nodes,
      axisRows,
      axisColumns,
      metrics,
      bounds,
      isLODEnabled,
      failedImages,
      layoutMode,
      eventMap,
      showDebug,
      activeCardIndex,
      isKioskMode,
      activeSentiment,
      showCompactAxis = true,
      alwaysShowSentimentLines = false,
    } = params;

    const currentScale = viewport.scale;
    const useHighRes = currentScale >= this.options.imageLODThreshold;

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    ctx.save();
    viewport.applyTransform(ctx);

    // Render axis only in dayTimeline mode (landscape - vertical axis on left)
    if (layoutMode === 'dayTimeline') {
      this.drawAxis(ctx, axisRows, metrics, bounds);
    }

    // Render axis only in dayTimelinePortrait mode (portrait - horizontal axis at bottom)
    if (layoutMode === 'dayTimelinePortrait' && axisColumns) {
      this.drawPortraitAxis(ctx, axisColumns, bounds, currentScale, showCompactAxis);
    }

    // Render date headers in singleRow mode
    if (layoutMode === 'singleRow') {
      this.drawSingleRowDateHeaders(ctx, nodes);
    }

    // Calculate delta time for animations
    const now = performance.now();
    const deltaTime = this.lastFrameTime > 0 ? now - this.lastFrameTime : 16;
    this.lastFrameTime = now;

    // Update and render sentiment lines
    // If alwaysShowSentimentLines is true, always show them
    // Otherwise, only show when zoomed out (LOD mode, scale < 0.4)
    const showSentimentLines = alwaysShowSentimentLines || (isLODEnabled && currentScale < 0.4);
    this.sentimentLines.updateVisibility(showSentimentLines, deltaTime);

    if (this.sentimentLines.isVisible()) {
      this.sentimentLines.render(
        ctx,
        nodes,
        ctx.canvas.width,
        ctx.canvas.height,
        currentScale,
        viewport.offset.x,
        viewport.offset.y,
      );
    }

    this.drawEvents(ctx, {
      nodes,
      currentScale,
      useHighRes,
      isLODEnabled,
      failedImages,
      viewport,
      eventMap,
      showDebug,
      activeCardIndex,
      isKioskMode,
      activeSentiment,
    });

    ctx.restore();
    // Canvas overlay removed - using HTML Debug Panel instead (App.tsx)
  }

  private drawAxis(
    ctx: CanvasRenderingContext2D,
    axisRows: DayAxisRow[],
    metrics: DayTimelineLayouterConfig | null,
    bounds: DayTimelineBounds | null,
  ): void {
    const axisWidth = metrics?.axisWidth ?? 220;
    const axisHeight = bounds?.height ?? window.innerHeight;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, axisWidth, axisHeight);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(axisWidth - 8, 0);
    ctx.lineTo(axisWidth - 8, axisHeight);
    ctx.stroke();

    axisRows.forEach((row) => {
      ctx.fillStyle = row.index % 2 === 0 ? '#111b2f' : '#0d1526';
      ctx.fillRect(0, row.y, axisWidth, row.height);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px "Bricolage Grotesque", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${row.eventCount} Artikel`, 20, row.y + row.height - 20);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 20px "Bricolage Grotesque", sans-serif';
      ctx.fillText(row.label.toUpperCase(), 20, row.y + 30);
    });
  }

  /**
   * Draw horizontal axis at TOP for Portrait layout
   * Each column represents a day with date label and article count
   *
   * LOD behavior:
   * - Detail mode (wide columns): Horizontal date + article count
   * - Compact mode (narrow columns): Vertical rotated day number only
   */
  private drawPortraitAxis(
    ctx: CanvasRenderingContext2D,
    axisColumns: DayAxisColumn[],
    _bounds: DayTimelineBounds | DayTimelinePortraitBounds | null,
    currentScale: number,
    showCompactAxis: boolean = true,
  ): void {
    ctx.save(); // Save context state to prevent text alignment leaking to cards

    const axisHeight = 80; // Fixed axis height
    const axisY = 0; // Axis at top

    // LOD threshold: switch to compact mode when screen-space column width < 40px
    // Lower than card LOD (80px) so axis stays detailed longer
    const LOD_THRESHOLD = 60;

    // Transition range for smooth fade between modes
    const TRANSITION_START = LOD_THRESHOLD + 20; // Start fading at 80px
    const TRANSITION_END = LOD_THRESHOLD; // Fully compact at 60px

    // Draw each column
    axisColumns.forEach((col) => {

      // Calculate screen-space column width
      const screenColWidth = col.width * currentScale;

      // Calculate transition progress (1 = full detail, 0 = full compact)
      const detailOpacity = Math.min(1, Math.max(0,
        (screenColWidth - TRANSITION_END) / (TRANSITION_START - TRANSITION_END)
      ));
      const compactOpacity = 1 - detailOpacity;

      // Compact date string
      const keyParts = col.key.split('-'); // ["2025", "04", "13"]
      const fullDate = keyParts.length === 3
        ? `${keyParts[2]}.${keyParts[1]}.${keyParts[0].slice(2)}` // "13.04.25"
        : col.label;

      // Draw compact mode (vertical date) with fade - only if showCompactAxis is true
      if (showCompactAxis && compactOpacity > 0) {
        ctx.save();
        ctx.globalAlpha = compactOpacity;

        // Position at bottom of axis with padding
        const padding = 10;
        const anchorX = col.x + col.width / 2;
        const anchorY = axisY + axisHeight - padding; // Bottom aligned

        ctx.translate(anchorX, anchorY);
        ctx.rotate(-Math.PI / 2); // Rotate 90° counter-clockwise

        // Font size limited to column width (text is rotated, so width = available height)
        const fontSize = Math.min(col.width * 0.8, 150);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = `300 ${fontSize}px "Bricolage Grotesque", sans-serif`;
        ctx.textAlign = 'left'; // Left = bottom after rotation
        ctx.textBaseline = 'middle';
        ctx.fillText(fullDate, 0, 0);

        ctx.restore();
      }

      // Draw detail mode (horizontal date + count) with fade
      if (detailOpacity > 0) {
        ctx.save();
        ctx.globalAlpha = detailOpacity;

        // Date label (centered horizontally in column) - font size doubled
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 32px "Bricolage Grotesque", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(col.label.toUpperCase(), col.x + col.width / 2, axisY + 40);

        // Article count - font size doubled, positioned lower
        ctx.fillStyle = '#94a3b8';
        ctx.font = '24px "Bricolage Grotesque", sans-serif';
        ctx.fillText(`${col.eventCount} Artikel`, col.x + col.width / 2, axisY + 75);

        ctx.restore();
      }
    });

    ctx.restore(); // Restore context state
  }

  private drawSingleRowDateHeaders(ctx: CanvasRenderingContext2D, nodes: LayoutNode<KoralmEvent>[]): void {
    nodes.forEach((node) => {
      const event = node.data;
      const x = node.posX.value ?? 0;
      const y = node.posY.value ?? 0;
      const width = node.width.value ?? 0;

      if (!width || !event.publishedAt) return;

      // Format date
      const date = new Date(event.publishedAt);
      if (Number.isNaN(date.getTime())) return;

      const formatter = new Intl.DateTimeFormat('de-AT', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

      const dateLabel = formatter.format(date);
      const headerHeight = 30;
      const headerY = y - headerHeight - 5;

      ctx.save();
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x, headerY, width, headerHeight);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 14px "Bricolage Grotesque", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(dateLabel, x + width / 2, headerY + headerHeight / 2);

      ctx.restore();
    });
  }

  private drawEvents(
    ctx: CanvasRenderingContext2D,
    params: {
      nodes: LayoutNode<KoralmEvent>[];
      currentScale: number;
      useHighRes: boolean;
      isLODEnabled: boolean;
      failedImages: Set<string>;
      viewport: ViewportTransform;
      eventMap?: Map<string, KoralmEvent>;
      showDebug?: boolean;
      activeCardIndex?: number;
      isKioskMode?: boolean;
      activeSentiment?: number | null;
    },
  ): void {
    const { nodes, currentScale, useHighRes, isLODEnabled, failedImages, viewport, eventMap, showDebug, activeCardIndex, isKioskMode, activeSentiment } = params;

    // Update glow border animation
    this.glowBorder.updateWithTime(performance.now());

    const devicePixelRatio = window.devicePixelRatio || 1;
    const cssWidth = ctx.canvas.width / devicePixelRatio;
    const cssHeight = ctx.canvas.height / devicePixelRatio;
    const viewMinX = (-viewport.offset.x) / viewport.scale;
    const viewMinY = (-viewport.offset.y) / viewport.scale;
    const viewMaxX = viewMinX + cssWidth / viewport.scale;
    const viewMaxY = viewMinY + cssHeight / viewport.scale;
    const cullMargin = 80;

    nodes.forEach((node) => {
      // Use eventMap to get current event data (with QR codes), fallback to node.data
      const event = eventMap?.get(node.data.id) ?? node.data;
      const x = node.posX.value ?? 0;
      const y = node.posY.value ?? 0;
      const width = node.width.value ?? 0;
      const height = node.height.value ?? 0;
      if (!width || !height) return;

      const eventMinX = x;
      const eventMaxX = x + width;
      const eventMinY = y;
      const eventMaxY = y + height;
      const isVisible =
        eventMaxX >= viewMinX - cullMargin &&
        eventMinX <= viewMaxX + cullMargin &&
        eventMaxY >= viewMinY - cullMargin &&
        eventMinY <= viewMaxY + cullMargin;

      if (!isVisible) {
        return;
      }

      // Handle high-res image loading
      if (
        this.options.enableHighResFetch &&
        useHighRes &&
        event.imageUrl &&
        !failedImages.has(event.imageUrl) &&
        !this.highResInFlight.has(event.imageUrl)
      ) {
        this.highResInFlight.add(event.imageUrl);
        const urlObj = new URL(event.imageUrl);
        const existingFormat = urlObj.searchParams.get('format');

        const isPlaywrightScreenshot = this.isScreenshot(event);
        const targetWidth = isPlaywrightScreenshot ? 2500 : 1200;

        const highResConfig: HighResImageConfig = {
          width: targetWidth,
          format: existingFormat || 'jpg',
          quality: 90,
        };
        this.options
          .loadHighResImage(event.imageUrl, highResConfig)
          .then((img) => {
            if (!img) {
              failedImages.add(event.imageUrl!);
            }
          })
          .catch(() => {
            failedImages.add(event.imageUrl!);
          })
          .finally(() => {
            this.highResInFlight.delete(event.imageUrl!);
          });
      }

      const lodState = isLODEnabled
        ? this.options.updateLODState(event.id, width * currentScale)
        : { imageHeightPercent: 1, textOpacity: 1 };

      const img = event.imageUrl ? this.options.getImage(event.imageUrl, useHighRes) : null;

      // Use new card system for rendering
      this.renderCard(ctx, event, x, y, width, height, img, lodState, showDebug, currentScale);
    });

    // Draw glow border around active kiosk card (after all cards so it's on top)
    if (isKioskMode && activeCardIndex !== undefined && activeCardIndex >= 0 && activeCardIndex < nodes.length) {
      const activeNode = nodes[activeCardIndex];
      const x = activeNode.posX.value ?? 0;
      const y = activeNode.posY.value ?? 0;
      const width = activeNode.width.value ?? 0;
      const height = activeNode.height.value ?? 0;

      if (width && height) {
        // Set glow color based on sentiment: cyan (positive), yellow (neutral), magenta (negative)
        const sentiment = activeSentiment ?? 0;
        let glowColor: string;
        let glowSecondary: string;

        if (sentiment > 0.3) {
          // Positive: Cyan
          glowColor = 'rgba(0, 255, 255, 0.95)';
          glowSecondary = 'rgba(0, 200, 255, 0.6)';
        } else if (sentiment < -0.3) {
          // Negative: Magenta
          glowColor = 'rgba(255, 0, 255, 0.95)';
          glowSecondary = 'rgba(255, 100, 255, 0.6)';
        } else {
          // Neutral: Yellow
          glowColor = 'rgba(255, 255, 0, 0.95)';
          glowSecondary = 'rgba(255, 220, 100, 0.6)';
        }

        this.glowBorder.setConfig({ color: glowColor, secondaryColor: glowSecondary });
        this.glowBorder.render(ctx, x, y, width, height, 5);
      }
    }
  }

  /**
   * Render a single card using the card factory
   */
  private renderCard(
    ctx: CanvasRenderingContext2D,
    event: KoralmEvent,
    x: number,
    y: number,
    width: number,
    height: number,
    image: HTMLImageElement | null,
    lodState: { imageHeightPercent: number; textOpacity: number },
    showDebug?: boolean,
    scale?: number,
  ): void {
    // Map cardStyle to card factory style
    // imageOnly -> overlay (fullsize image with text overlay)
    // catalog -> summary (compact with summary text)
    // standard -> title (50/50 image/text split)
    let cardStyle: CardStyleType | undefined;
    if (event.cardStyle === 'imageOnly') {
      cardStyle = 'overlay';
    } else if (event.cardStyle === 'catalog') {
      cardStyle = 'summary';
    } else if (event.cardStyle === 'standard') {
      cardStyle = 'title';
    }

    // Create card instance
    const card = this.cardFactory.createCard(event, cardStyle);

    // Render the card
    card.render({
      ctx,
      x,
      y,
      width,
      height,
      image,
      lodState,
      showDebug,
      scale,
    });
  }

  // Canvas overlay removed - using HTML Debug Panel instead (App.tsx)
}
