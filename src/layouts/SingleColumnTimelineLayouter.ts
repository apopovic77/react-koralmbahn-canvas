import { Vector2 } from 'arkturian-canvas-engine';
import type { LayoutNode } from 'arkturian-canvas-engine/src/layout/LayoutNode';
import type { ILayouter } from 'arkturian-canvas-engine/src/layout/LayoutEngine';

import type { KoralmEvent } from '../types/koralmbahn';

export interface SingleColumnBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface SingleColumnLayouterConfig {
  startX: number;
  startY: number;
  rowGap: number;
  cardWidth: number;
  cardHeight: number;
}

const DEFAULT_CONFIG: SingleColumnLayouterConfig = {
  startX: 400, // Leave space on left for sentiment nodes
  startY: 50,
  rowGap: 24,
  cardWidth: 260,
  cardHeight: 421, // Golden ratio portrait (1:1.618): 260 * 1.618 = 421
};

/**
 * SingleColumnTimelineLayouter - Arranges all cards vertically in a single column
 *
 * Used for vertical scrolling view with sentiment nodes on the left side.
 */
export class SingleColumnTimelineLayouter implements ILayouter<KoralmEvent> {
  private readonly config: SingleColumnLayouterConfig;
  private bounds: SingleColumnBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };

  constructor(config?: Partial<SingleColumnLayouterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  compute(nodes: LayoutNode<KoralmEvent>[], _view: { width: number; height: number }): void {
    if (nodes.length === 0) {
      this.bounds = {
        minX: 0,
        minY: 0,
        maxX: this.config.startX + this.config.cardWidth,
        maxY: this.config.startY,
        width: this.config.cardWidth,
        height: 0
      };
      return;
    }

    // Sort all events by publishedAt: Newest first (top)
    const sortedNodes = [...nodes].sort((a, b) => {
      const aTime = a.data.publishedAt ? new Date(a.data.publishedAt).getTime() : 0;
      const bTime = b.data.publishedAt ? new Date(b.data.publishedAt).getTime() : 0;
      return bTime - aTime; // Newest first
    });

    // Layout: All in a vertical column
    const x = this.config.startX;
    let currentY = this.config.startY;

    sortedNodes.forEach((node) => {
      const targetPos = new Vector2(x, currentY);
      const targetSize = new Vector2(this.config.cardWidth, this.config.cardHeight);
      node.setTargets(targetPos, targetSize, 1, 1);

      currentY += this.config.cardHeight + this.config.rowGap;
    });

    // Calculate bounds
    const contentHeight = currentY - this.config.rowGap; // Remove last gap
    const contentWidth = this.config.cardWidth;

    this.bounds = {
      minX: this.config.startX,
      minY: this.config.startY,
      maxX: this.config.startX + contentWidth,
      maxY: contentHeight,
      width: contentWidth,
      height: contentHeight - this.config.startY,
    };
  }

  getContentBounds(): SingleColumnBounds {
    return this.bounds;
  }

  getMetrics(): SingleColumnLayouterConfig {
    return { ...this.config };
  }
}
