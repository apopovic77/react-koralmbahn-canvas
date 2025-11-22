import { Vector2 } from 'arkturian-canvas-engine';
import type { LayoutNode } from 'arkturian-canvas-engine/src/layout/LayoutNode';
import type { ILayouter } from 'arkturian-canvas-engine/src/layout/LayoutEngine';

import type { KoralmEvent } from '../types/koralmbahn';

export interface SingleRowBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface SingleRowLayouterConfig {
  startX: number;
  startY: number;
  columnGap: number;
  cardWidth: number;
  cardHeight: number;
}

const DEFAULT_CONFIG: SingleRowLayouterConfig = {
  startX: 50,
  startY: 90, // Space for date header (30px) + margin (5px) + extra spacing
  columnGap: 24,
  cardWidth: 260,
  cardHeight: 460, // 9:16 aspect ratio (smartphone format): 260 * 16/9 = 460
};

export class SingleRowTimelineLayouter implements ILayouter<KoralmEvent> {
  private readonly config: SingleRowLayouterConfig;
  private bounds: SingleRowBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };

  constructor(config?: Partial<SingleRowLayouterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  compute(nodes: LayoutNode<KoralmEvent>[], _view: { width: number; height: number }): void {
    if (nodes.length === 0) {
      this.bounds = {
        minX: 0,
        minY: 0,
        maxX: this.config.startX,
        maxY: this.config.startY + this.config.cardHeight,
        width: this.config.startX,
        height: this.config.cardHeight
      };
      return;
    }

    // Sortiere alle Events nach publishedAt: Neueste zuerst (links)
    const sortedNodes = [...nodes].sort((a, b) => {
      const aTime = a.data.publishedAt ? new Date(a.data.publishedAt).getTime() : 0;
      const bTime = b.data.publishedAt ? new Date(b.data.publishedAt).getTime() : 0;
      return bTime - aTime; // Neueste zuerst
    });

    // Layout: Alle in einer horizontalen Reihe
    let currentX = this.config.startX;
    const y = this.config.startY;

    sortedNodes.forEach((node) => {
      const targetPos = new Vector2(currentX, y);
      const targetSize = new Vector2(this.config.cardWidth, this.config.cardHeight);
      node.setTargets(targetPos, targetSize, 1, 1);

      currentX += this.config.cardWidth + this.config.columnGap;
    });

    // Bounds berechnen
    const contentWidth = currentX - this.config.columnGap; // Letzten Gap entfernen
    const contentHeight = this.config.cardHeight;

    this.bounds = {
      minX: this.config.startX,
      minY: this.config.startY,
      maxX: contentWidth,
      maxY: this.config.startY + contentHeight,
      width: contentWidth - this.config.startX,
      height: contentHeight,
    };
  }

  getContentBounds(): SingleRowBounds {
    return this.bounds;
  }

  getMetrics(): SingleRowLayouterConfig {
    return { ...this.config };
  }
}
