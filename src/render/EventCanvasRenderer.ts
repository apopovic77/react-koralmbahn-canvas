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
}

export class EventCanvasRenderer {
  private readonly options: EventCanvasRendererOptions;
  private highResInFlight = new Set<string>();

  constructor(options: EventCanvasRendererOptions) {
    this.options = options;
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
    } = params;

    const currentScale = viewport.scale;
    const useHighRes = currentScale >= this.options.imageLODThreshold;

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    ctx.save();
    viewport.applyTransform(ctx);

    this.drawAxis(ctx, axisRows, metrics, bounds);
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
        const highResConfig: HighResImageConfig = {
          width: 800,
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

      if (imgAspect > targetAspect) {
        drawHeight = imageHeight;
        drawWidth = imageHeight * imgAspect;
        offsetX = -(drawWidth - width) / 2;
      } else {
        drawWidth = width;
        drawHeight = width / imgAspect;
        offsetY = -(drawHeight - imageHeight) / 2;
      }

      ctx.drawImage(img, x + offsetX, y + offsetY, drawWidth, drawHeight);
      ctx.restore();
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

    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 13px "Bricolage Grotesque", sans-serif';
    this.drawMultilineText(ctx, event.title, textStartX, textStartY, textWidth, 13, 2, 16);

    let textOffset = textStartY + 2 * 16 + 6;

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

    ctx.fillStyle = '#0066cc';
    ctx.fillText(this.truncateUrl(ctx, event.url, textWidth), textStartX, textOffset);

    if (event.qrCode && event.qrCode.complete) {
      const qrSize = 60;
      const qrX = x + width - qrSize - 8;
      const qrY = y + height - qrSize - 8;
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
      ctx.shadowBlur = 4;
      ctx.fillStyle = '#fff';
      ctx.fillRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8);
      ctx.restore();
      ctx.drawImage(event.qrCode, qrX, qrY, qrSize, qrSize);
    }

    ctx.globalAlpha = 1;
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

    const limit = Math.min(maxLines, lines.length);
    for (let i = 0; i < limit; i++) {
      const isLastAllowedLine = i === limit - 1;
      const needsEllipsis = appendEllipsis && isLastAllowedLine && lines.length > maxLines;
      const content = needsEllipsis ? `${lines[i]}...` : lines[i];
      ctx.fillText(content, x, startY + i * lineHeight);
    }

    return startY + limit * lineHeight + (limit > 0 ? 0 : fontSize);
  }

  private truncateUrl(ctx: CanvasRenderingContext2D, url: string, maxWidth: number): string {
    let displayUrl = url;
    if (ctx.measureText(displayUrl).width <= maxWidth) {
      return displayUrl;
    }

    const urlParts = displayUrl.split('/');
    displayUrl = urlParts[0] + '//' + urlParts[2] + '/.../' + urlParts[urlParts.length - 1];
    if (ctx.measureText(displayUrl).width > maxWidth) {
      displayUrl = displayUrl.substring(0, 30) + '...';
    }
    return displayUrl;
  }
}
