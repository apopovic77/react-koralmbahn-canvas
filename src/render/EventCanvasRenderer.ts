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
}

export class EventCanvasRenderer {
  private readonly options: EventCanvasRendererOptions;
  private highResInFlight = new Set<string>();
  private cardFactory: CardFactory;

  constructor(options: EventCanvasRendererOptions) {
    this.options = options;

    // Initialize card factory with provided config or defaults
    this.cardFactory = new CardFactory(options.cardFactoryConfig || {
      aspectRatio: '4:3',
      defaultStyle: 'summary',
      baseConfig: {
        padding: options.padding,
      },
    });
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
      this.drawPortraitAxis(ctx, axisColumns, bounds, currentScale);
    }

    // Render date headers in singleRow mode
    if (layoutMode === 'singleRow') {
      this.drawSingleRowDateHeaders(ctx, nodes);
    }

    this.drawEvents(ctx, {
      nodes,
      currentScale,
      useHighRes,
      isLODEnabled,
      failedImages,
      viewport,
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
    bounds: DayTimelineBounds | DayTimelinePortraitBounds | null,
    currentScale: number,
  ): void {
    ctx.save(); // Save context state to prevent text alignment leaking to cards

    const axisHeight = 80; // Fixed axis height
    const axisY = 0; // Axis at top
    const totalWidth = bounds?.width ?? window.innerWidth;

    // LOD threshold: switch to compact mode when screen-space column width < 40px
    // Lower than card LOD (80px) so axis stays detailed longer
    const LOD_THRESHOLD = 40;

    // Draw axis background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, axisY, totalWidth, axisHeight);

    // Draw bottom border line (separator between axis and cards)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, axisHeight - 8);
    ctx.lineTo(totalWidth, axisHeight - 8);
    ctx.stroke();

    // Draw each column
    axisColumns.forEach((col) => {
      // Alternating column backgrounds
      ctx.fillStyle = col.index % 2 === 0 ? '#111b2f' : '#0d1526';
      ctx.fillRect(col.x, axisY, col.width, axisHeight);

      // Calculate screen-space column width
      const screenColWidth = col.width * currentScale;
      const isCompactMode = screenColWidth < LOD_THRESHOLD;

      if (isCompactMode) {
        // Compact mode: Vertical rotated full date (DD.MM.YY)
        // Use key (ISO format: 2025-04-13) to build compact date
        const keyParts = col.key.split('-'); // ["2025", "04", "13"]
        const fullDate = keyParts.length === 3
          ? `${keyParts[2]}.${keyParts[1]}.${keyParts[0].slice(2)}` // "13.04.25"
          : col.label;

        ctx.save();

        // Position at bottom of axis with padding
        const padding = 10;
        const anchorX = col.x + col.width / 2;
        const anchorY = axisY + axisHeight - padding; // Bottom aligned

        ctx.translate(anchorX, anchorY);
        ctx.rotate(-Math.PI / 2); // Rotate 90° counter-clockwise

        // Font size limited to column width (text is rotated, so width = available height)
        const fontSize = Math.min(col.width * 0.8, 200);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = `300 ${fontSize}px "Bricolage Grotesque", sans-serif`; // 300 = light weight
        ctx.textAlign = 'left'; // Left = bottom after rotation
        ctx.textBaseline = 'middle';
        ctx.fillText(fullDate, 0, 0);

        ctx.restore();
      } else {
        // Detail mode: Full horizontal date + article count
        // Date label (centered horizontally in column)
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 16px "Bricolage Grotesque", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(col.label.toUpperCase(), col.x + col.width / 2, axisY + 25);

        // Article count
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px "Bricolage Grotesque", sans-serif';
        ctx.fillText(`${col.eventCount} Artikel`, col.x + col.width / 2, axisY + 50);
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
    },
  ): void {
    const { nodes, currentScale, useHighRes, isLODEnabled, failedImages, viewport } = params;

    const devicePixelRatio = window.devicePixelRatio || 1;
    const cssWidth = ctx.canvas.width / devicePixelRatio;
    const cssHeight = ctx.canvas.height / devicePixelRatio;
    const viewMinX = (-viewport.offset.x) / viewport.scale;
    const viewMinY = (-viewport.offset.y) / viewport.scale;
    const viewMaxX = viewMinX + cssWidth / viewport.scale;
    const viewMaxY = viewMinY + cssHeight / viewport.scale;
    const cullMargin = 80;

    nodes.forEach((node) => {
      const event = node.data;
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
      this.renderCard(ctx, event, x, y, width, height, img, lodState);
    });
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
  ): void {
    // Map old cardStyle to new system, or use default
    let cardStyle: CardStyleType | undefined;
    if (event.cardStyle === 'imageOnly') {
      cardStyle = 'overlay';
    } else if (event.cardStyle === 'catalog') {
      cardStyle = 'summary';
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
    });
  }

  // Canvas overlay removed - using HTML Debug Panel instead (App.tsx)
}
