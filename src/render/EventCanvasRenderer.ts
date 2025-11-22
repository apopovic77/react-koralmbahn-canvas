import type { ViewportTransform, HighResImageConfig } from 'arkturian-canvas-engine';
import type { LayoutNode } from 'arkturian-canvas-engine/src/layout/LayoutNode';

import type { KoralmEvent } from '../types/koralmbahn';
import type { KioskMode } from '../hooks/useKioskMode';
import type { DayAxisRow, DayTimelineBounds, DayTimelineLayouterConfig } from '../layouts/DayTimelineLayouter';

interface EventCanvasRendererOptions {
  padding: number;
  imageLODThreshold: number;
  getImage: (url: string, useHighRes: boolean) => HTMLImageElement | null;
  loadHighResImage: (url: string, config?: HighResImageConfig) => Promise<HTMLImageElement | null>;
  updateLODState: (itemId: string, screenCardWidth: number) => { imageHeightPercent: number; textOpacity: number };
  enableHighResFetch: boolean;
}

interface RenderFrameParams {
  ctx: CanvasRenderingContext2D;
  viewport: ViewportTransform;
  nodes: LayoutNode<KoralmEvent>[];
  axisRows: DayAxisRow[];
  metrics: DayTimelineLayouterConfig | null;
  bounds: DayTimelineBounds | null;
  kioskMode: KioskMode;
  articlesViewedCount: number;
  isLODEnabled: boolean;
  isKioskModeEnabled: boolean;
  is3DMode: boolean;
  isHighResEnabled: boolean;
  failedImages: Set<string>;
  renderDelta: number;
  updateDelta: number;
  layoutMode: 'dayTimeline' | 'singleRow' | 'masonryVertical' | 'masonryHorizontal';
}

export class EventCanvasRenderer {
  private readonly options: EventCanvasRendererOptions;
  private highResInFlight = new Set<string>();

  constructor(options: EventCanvasRendererOptions) {
    this.options = options;
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
      metrics,
      bounds,
      kioskMode,
      articlesViewedCount,
      isLODEnabled,
      isKioskModeEnabled,
      is3DMode,
      isHighResEnabled,
      failedImages,
      renderDelta,
      updateDelta,
      layoutMode,
    } = params;

    const currentScale = viewport.scale;
    const useHighRes = currentScale >= this.options.imageLODThreshold;

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    ctx.save();
    viewport.applyTransform(ctx);

    // Render axis only in dayTimeline mode
    if (layoutMode === 'dayTimeline') {
      this.drawAxis(ctx, axisRows, metrics, bounds);
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

    this.drawOverlay(ctx, {
      viewport,
      eventsCount: nodes.length,
      kioskMode,
      articlesViewedCount,
      useHighRes,
      renderDelta,
      updateDelta,
      isLODEnabled,
      isKioskModeEnabled,
      is3DMode,
      isHighResEnabled,
    });
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

      // Save canvas state before modifying it
      ctx.save();

      // Draw header background
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x, headerY, width, headerHeight);

      // Draw date text
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 14px "Bricolage Grotesque", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(dateLabel, x + width / 2, headerY + headerHeight / 2);

      // Restore canvas state
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

        // Detect Playwright/PDF screenshots using robust API markers
        const isPlaywrightScreenshot = this.isScreenshot(event);

        // Screenshots: use 2500px for excellent text clarity
        // Regular images: use 1200px
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

      const transitionState = isLODEnabled
        ? this.options.updateLODState(event.id, width * currentScale)
        : { imageHeightPercent: 1, textOpacity: 1 };

      const img = event.imageUrl ? this.options.getImage(event.imageUrl, useHighRes) : null;
      this.drawCard(ctx, { ...event, x, y, width, height }, transitionState, img);
    });
  }

  private drawCard(
    ctx: CanvasRenderingContext2D,
    event: KoralmEvent,
    transitionState: { imageHeightPercent: number; textOpacity: number },
    img: HTMLImageElement | null,
  ): void {
    const { padding } = this.options;
    const { x = 0, y = 0, width = 0, height = 0 } = event;

    // Handle 'imageOnly' card style: Just show the hero image filling the entire card
    if (event.cardStyle === 'imageOnly') {
      this.drawImageOnlyCard(ctx, event, img);
      return;
    }

    // Handle 'catalog' card style: Compact news catalog layout
    if (event.cardStyle === 'catalog') {
      this.drawCatalogCard(ctx, event, img);
      return;
    }

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

    const imageHeight = Math.floor(height * transitionState.imageHeightPercent);
    if (img && img.complete) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, width, imageHeight);
      ctx.clip();

      const imgAspect = img.width / img.height;
      const targetAspect = width / imageHeight;
      let drawWidth = width;
      let drawHeight = imageHeight;
      let offsetX = 0;
      let offsetY = 0;

      // Check if this is a screenshot for top-alignment
      const isScreenshotImage = this.isScreenshot(event);

      if (imgAspect > targetAspect) {
        // Image wider than container: fit width
        drawHeight = imageHeight;
        drawWidth = imageHeight * imgAspect;
        offsetX = -(drawWidth - width) / 2;
      } else {
        // Image taller than container: fit height
        drawWidth = width;
        drawHeight = width / imgAspect;
        // Screenshots: top-aligned, Regular images: center-aligned
        offsetY = isScreenshotImage ? 0 : -(drawHeight - imageHeight) / 2;
      }

      ctx.drawImage(img, x + offsetX, y + offsetY, drawWidth, drawHeight);
      ctx.restore();

      // DEBUG: Screenshot detection marker
      if (isScreenshotImage) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.fillRect(x + 5, y + 5, 90, 20);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('SCREENSHOT', x + 10, y + 19);
        ctx.restore();
      }
    } else {
      ctx.fillStyle = '#e0e0e0';
      ctx.fillRect(x, y, width, imageHeight);
    }

    if (transitionState.textOpacity <= 0.01) {
      return;
    }

    ctx.globalAlpha = transitionState.textOpacity;
    const textStartY = y + imageHeight + padding;
    const textStartX = x + padding;
    const textWidth = width - padding * 2;

    // QR-Code klein (35px) rechts oben
    const qrSize = 35;
    const qrMargin = 8;

    if (event.qrCode && event.qrCode.complete) {
      const qrX = x + width - qrSize - padding;
      const qrY = textStartY;
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
      ctx.shadowBlur = 3;
      ctx.fillStyle = '#fff';
      ctx.fillRect(qrX - 2, qrY - 2, qrSize + 4, qrSize + 4);
      ctx.restore();
      ctx.drawImage(event.qrCode, qrX, qrY, qrSize, qrSize);
    }

    // Titel mit Platz für QR-Code rechts
    const titleWidth = textWidth - qrSize - qrMargin;
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 13px "Bricolage Grotesque", sans-serif';
    this.drawMultilineText(ctx, event.title, textStartX, textStartY, titleWidth, 13, 3, 16);

    let textOffset = textStartY + 3 * 16 + 6;

    if (event.subtitle || event.sourceName) {
      ctx.fillStyle = '#666';
      ctx.font = '10px "Bricolage Grotesque", sans-serif';
      textOffset = this.drawMultilineText(ctx, event.subtitle || event.sourceName || '', textStartX, textOffset, textWidth, 10, 1, 14);
    }

    ctx.fillStyle = '#444';
    ctx.font = '11px "Bricolage Grotesque", sans-serif';
    textOffset = this.drawMultilineText(ctx, event.summary, textStartX, textOffset, textWidth, 11, 3, 14, true);

    ctx.fillStyle = '#999';
    ctx.font = '9px monospace';
    ctx.fillText(`ID: ${event.id}`, textStartX, textOffset);
    textOffset += 12;

    // URL mit Umbruch anzeigen (max 3 Zeilen)
    ctx.fillStyle = '#0066cc';
    ctx.font = '8px monospace';
    textOffset = this.drawMultilineText(ctx, event.url, textStartX, textOffset, textWidth, 8, 3, 10);

    ctx.globalAlpha = 1;
  }

  /**
   * Draw image-only card: Just the hero image filling the entire card area
   * Used for masonry layout mode where we want a clean image gallery
   */
  private drawImageOnlyCard(
    ctx: CanvasRenderingContext2D,
    event: KoralmEvent,
    img: HTMLImageElement | null,
  ): void {
    const { x = 0, y = 0, width = 0, height = 0 } = event;

    // Draw shadow and border
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 5, y - 5, width + 10, height + 10);
    ctx.clip();

    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 3;
    ctx.fillRect(x, y, width, height);
    ctx.restore();

    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);

    // Draw image filling entire card
    if (img && img.complete) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, width, height);
      ctx.clip();

      const imgAspect = img.width / img.height;
      const targetAspect = width / height;
      let drawWidth = width;
      let drawHeight = height;
      let offsetX = 0;
      let offsetY = 0;

      // Check if this is a screenshot for top-alignment
      const isScreenshotImage = this.isScreenshot(event);

      // Cover entire card area
      if (imgAspect > targetAspect) {
        // Image wider than container: fit width
        drawHeight = height;
        drawWidth = height * imgAspect;
        offsetX = -(drawWidth - width) / 2;
      } else {
        // Image taller than container: fit height
        drawWidth = width;
        drawHeight = width / imgAspect;
        // Screenshots: top-aligned, Regular images: center-aligned
        offsetY = isScreenshotImage ? 0 : -(drawHeight - height) / 2;
      }

      ctx.drawImage(img, x + offsetX, y + offsetY, drawWidth, drawHeight);
      ctx.restore();

      // DEBUG: Screenshot detection marker
      if (isScreenshotImage) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.fillRect(x + 5, y + 5, 90, 20);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('SCREENSHOT', x + 10, y + 19);
        ctx.restore();
      }
    } else {
      // Placeholder while loading
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(x, y, width, height);
    }

    // QR Code (bottom-right corner, overlaid on image)
    const qrSize = 60;
    const qrPadding = 10;
    if (event.qrCode && event.qrCode.complete) {
      const qrX = x + width - qrSize - qrPadding;
      const qrY = y + height - qrSize - qrPadding;
      ctx.save();
      // White background with shadow
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      ctx.shadowBlur = 6;
      ctx.fillRect(qrX - 3, qrY - 3, qrSize + 6, qrSize + 6);
      ctx.restore();
      // Border
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 1;
      ctx.strokeRect(qrX - 3, qrY - 3, qrSize + 6, qrSize + 6);
      // QR code image
      ctx.drawImage(event.qrCode, qrX, qrY, qrSize, qrSize);
    }
  }

  /**
   * Catalog card: Compact newspaper/magazine layout
   * - Small image (fixed width, preserves aspect ratio)
   * - Full text content (title, subtitle, summary - no truncation)
   * - Variable card height based on content
   * - Newspaper article character
   */
  private drawCatalogCard(
    ctx: CanvasRenderingContext2D,
    event: KoralmEvent,
    img: HTMLImageElement | null,
  ): void {
    const { padding } = this.options;
    const { x = 0, y = 0, width = 0, height = 0 } = event;

    if (!width || !height) return;

    // Card background with border
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    ctx.fillRect(x, y, width, height);
    ctx.restore();

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);

    let currentY = y + padding;

    // Draw image at top (fixed width, variable height based on aspect ratio)
    if (img && img.complete) {
      const imgAspect = img.width / img.height;
      const imageWidth = width;
      const imageHeight = imageWidth / imgAspect;

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, currentY, imageWidth, imageHeight);
      ctx.clip();

      // Check if screenshot for top-alignment
      const isScreenshotImage = this.isScreenshot(event);
      ctx.drawImage(img, x, currentY, imageWidth, imageHeight);
      ctx.restore();

      // DEBUG: Screenshot detection marker
      if (isScreenshotImage) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.fillRect(x + 5, currentY + 5, 90, 20);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('SCREENSHOT', x + 10, currentY + 19);
        ctx.restore();
      }

      currentY += imageHeight + padding;
    } else {
      // Placeholder for loading images (use 5:7 aspect ratio)
      const placeholderHeight = (width * 7) / 5;
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(x, currentY, width, placeholderHeight);
      currentY += placeholderHeight + padding;
    }

    const textX = x + padding;
    const textWidth = width - padding * 2;

    // Title (bold, larger)
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 14px "Bricolage Grotesque", sans-serif';
    currentY = this.drawMultilineText(ctx, event.title, textX, currentY, textWidth, 14, 999, 17);
    currentY += 4;

    // Subtitle or source (smaller, gray)
    if (event.subtitle || event.sourceName) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '11px "Bricolage Grotesque", sans-serif';
      const subtitle = event.subtitle || event.sourceName || '';
      currentY = this.drawMultilineText(ctx, subtitle, textX, currentY, textWidth, 11, 999, 14);
      currentY += 6;
    }

    // Summary (normal weight, no truncation)
    ctx.fillStyle = '#374151';
    ctx.font = '11px "Bricolage Grotesque", sans-serif';
    currentY = this.drawMultilineText(ctx, event.summary, textX, currentY, textWidth, 11, 999, 14, false);

    // QR Code (larger, bottom right)
    const qrSize = 50;
    if (event.qrCode && event.qrCode.complete) {
      const qrX = x + width - qrSize - padding;
      const qrY = y + height - qrSize - padding;
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.fillRect(qrX - 2, qrY - 2, qrSize + 4, qrSize + 4);
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.strokeRect(qrX - 2, qrY - 2, qrSize + 4, qrSize + 4);
      ctx.restore();
      ctx.drawImage(event.qrCode, qrX, qrY, qrSize, qrSize);
    }
  }

  private drawOverlay(
    ctx: CanvasRenderingContext2D,
    params: {
      viewport: ViewportTransform;
      eventsCount: number;
      kioskMode: KioskMode;
      articlesViewedCount: number;
      useHighRes: boolean;
      renderDelta: number;
      updateDelta: number;
      isLODEnabled: boolean;
      isKioskModeEnabled: boolean;
      is3DMode: boolean;
      isHighResEnabled: boolean;
    },
  ): void {
    const {
      viewport,
      eventsCount,
      kioskMode,
      articlesViewedCount,
      useHighRes,
      renderDelta,
      updateDelta,
      isLODEnabled,
      isKioskModeEnabled,
      is3DMode,
      isHighResEnabled,
    } = params;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(10, 10, 500, 150);
    ctx.fillStyle = '#fff';
    ctx.font = '14px "Bricolage Grotesque", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Koralmbahn Events Canvas', 20, 30);
    const modeText = kioskMode === 'overview' ? 'Overview' : `Article ${articlesViewedCount}/5`;
    ctx.fillText(
      `Events: ${eventsCount} | Mode: ${modeText} | Image: ${(useHighRes && isHighResEnabled) ? 'HIGH-RES' : 'THUMBNAIL'}`,
      20,
      50,
    );
    ctx.fillText(`Zoom: ${(viewport.scale * 100).toFixed(0)}% | Pan: ${Math.round(viewport.offset.x)}, ${Math.round(viewport.offset.y)}`, 20, 70);
    const actualRenderFPS = renderDelta > 0 ? Math.round(1000 / renderDelta) : 0;
    const actualUpdateFPS = updateDelta > 0 ? Math.round(1000 / updateDelta) : 0;
    ctx.fillText(
      `Render: ${actualRenderFPS}/60 FPS | Update: ${actualUpdateFPS}/25 FPS | Frame: ${renderDelta.toFixed(1)}ms`,
      20,
      90,
    );
    ctx.fillText('Mouse wheel = zoom | Right-click drag = pan', 20, 110);
    ctx.fillText(
      `F1: ${is3DMode ? '3D Mode' : '2D Mode'} | F2: LOD ${isLODEnabled ? 'ON' : 'OFF'} | F3: Kiosk ${isKioskModeEnabled ? 'ON' : 'OFF'} | F4: HighRes ${isHighResEnabled ? 'ON' : 'OFF'}`,
      20,
      140,
    );
  }

  private drawMultilineText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    startY: number,
    maxWidth: number,
    fontSize: number,
    maxLines: number,
    lineHeight: number,
    appendEllipsis = false,
  ): number {
    // For URLs: Split at / ? & = to allow wrapping
    const isUrl = text.startsWith('http://') || text.startsWith('https://');
    let words: string[];

    if (isUrl) {
      // Split URL at special characters but keep them
      words = text.split(/([/?&=])/g).filter(part => part.length > 0);
    } else {
      words = text.split(' ');
    }

    const lines: string[] = [];
    let currentLine = '';

    words.forEach((word) => {
      const separator = (isUrl || !currentLine) ? '' : ' ';
      const testLine = currentLine ? `${currentLine}${separator}${word}` : word;
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

    const limit = Math.min(maxLines, lines.length);
    for (let i = 0; i < limit; i++) {
      const isLastAllowedLine = i === limit - 1;
      const needsEllipsis = appendEllipsis && isLastAllowedLine && lines.length > maxLines;
      const content = needsEllipsis ? `${lines[i]}...` : lines[i];
      ctx.fillText(content, x, startY + i * lineHeight);
    }

    return startY + limit * lineHeight + (limit > 0 ? 0 : fontSize);
  }
}
