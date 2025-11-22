import { Vector2 } from 'arkturian-canvas-engine';
import type { LayoutNode } from 'arkturian-canvas-engine/src/layout/LayoutNode';
import type { ILayouter } from 'arkturian-canvas-engine/src/layout/LayoutEngine';

import type { KoralmEvent } from '../types/koralmbahn';

export type MasonryDirection = 'vertical' | 'horizontal';

export interface MasonryBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface MasonryLayouterConfig {
  direction: MasonryDirection;
  columnCount?: number; // For vertical masonry
  rowCount?: number; // For horizontal masonry
  targetWidth?: number; // Target width for items (vertical mode)
  targetHeight?: number; // Target height for items (horizontal mode)
  gap: number;
  padding: number;
  defaultAspectRatio: number; // Default aspect ratio if image not loaded (width/height)
  getImageAspectRatio?: (node: LayoutNode<KoralmEvent>) => number | null; // Callback to get actual image aspect ratio
  getExtraHeight?: (node: LayoutNode<KoralmEvent>, baseHeight: number) => number; // Callback to add extra height for text content
}

const DEFAULT_CONFIG: MasonryLayouterConfig = {
  direction: 'vertical',
  columnCount: 4,
  targetWidth: 300,
  gap: 16,
  padding: 50,
  defaultAspectRatio: 5 / 7, // Default card aspect ratio
};

/**
 * Masonry Layouter - Pinterest-style layout with variable item sizes
 *
 * OOP Design for future migration to base project:
 * - Generic ILayouter<T> implementation
 * - Configurable via constructor
 * - No hard dependencies on KoralmEvent (uses generic LayoutNode<T>)
 * - Clean separation of layout logic
 */
export class MasonryLayouter implements ILayouter<KoralmEvent> {
  private readonly config: MasonryLayouterConfig;
  private bounds: MasonryBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };

  constructor(config?: Partial<MasonryLayouterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  compute(nodes: LayoutNode<KoralmEvent>[], view: { width: number; height: number }): void {
    if (nodes.length === 0) {
      this.bounds = {
        minX: 0,
        minY: 0,
        maxX: this.config.padding,
        maxY: this.config.padding,
        width: this.config.padding,
        height: this.config.padding,
      };
      return;
    }

    if (this.config.direction === 'vertical') {
      this.computeVerticalMasonry(nodes, view);
    } else {
      this.computeHorizontalMasonry(nodes, view);
    }
  }

  /**
   * Vertical Masonry: Items flow down in columns
   */
  private computeVerticalMasonry(nodes: LayoutNode<KoralmEvent>[], view: { width: number; height: number }): void {
    const { columnCount = 4, targetWidth = 300, gap, padding } = this.config;

    // Calculate actual column width based on view width
    const availableWidth = view.width - padding * 2 - gap * (columnCount - 1);
    const columnWidth = Math.max(targetWidth, availableWidth / columnCount);

    // Track height of each column
    const columnHeights: number[] = new Array(columnCount).fill(padding);

    nodes.forEach((node) => {
      // Get aspect ratio from image or use default
      const aspectRatio = this.getAspectRatio(node);
      const width = columnWidth;
      let height = width / aspectRatio;

      // Add extra height for text content (e.g., catalog cards)
      if (this.config.getExtraHeight) {
        const extraHeight = this.config.getExtraHeight(node, height);
        height += extraHeight;
      }

      // Find shortest column
      const shortestColumnIndex = columnHeights.indexOf(Math.min(...columnHeights));
      const x = padding + shortestColumnIndex * (columnWidth + gap);
      const y = columnHeights[shortestColumnIndex];

      // Set targets
      const targetPos = new Vector2(x, y);
      const targetSize = new Vector2(width, height);
      node.setTargets(targetPos, targetSize, 1, 1);

      // Update column height
      columnHeights[shortestColumnIndex] = y + height + gap;
    });

    // Calculate bounds
    const maxColumnHeight = Math.max(...columnHeights);
    this.bounds = {
      minX: padding,
      minY: padding,
      maxX: padding + columnCount * columnWidth + (columnCount - 1) * gap,
      maxY: maxColumnHeight,
      width: columnCount * columnWidth + (columnCount - 1) * gap,
      height: maxColumnHeight - padding,
    };
  }

  /**
   * Horizontal Masonry: Items flow right in rows
   */
  private computeHorizontalMasonry(nodes: LayoutNode<KoralmEvent>[], view: { width: number; height: number }): void {
    const { rowCount = 3, targetHeight = 300, gap, padding } = this.config;

    // Calculate actual row height based on view height
    const availableHeight = view.height - padding * 2 - gap * (rowCount - 1);
    const rowHeight = Math.max(targetHeight, availableHeight / rowCount);

    // Track width of each row
    const rowWidths: number[] = new Array(rowCount).fill(padding);

    nodes.forEach((node) => {
      // Get aspect ratio from image or use default
      const aspectRatio = this.getAspectRatio(node);
      const height = rowHeight;
      let width = height * aspectRatio;

      // For catalog cards, we need to add width instead of height
      // Since they're laid out horizontally, we estimate the extra width needed
      if (this.config.getExtraHeight && node.data.cardStyle === 'catalog') {
        // In horizontal mode, catalog cards don't work well (they need vertical space)
        // Keep the aspect ratio calculation as-is for now
      }

      // Find shortest row
      const shortestRowIndex = rowWidths.indexOf(Math.min(...rowWidths));
      const x = rowWidths[shortestRowIndex];
      const y = padding + shortestRowIndex * (rowHeight + gap);

      // Set targets
      const targetPos = new Vector2(x, y);
      const targetSize = new Vector2(width, height);
      node.setTargets(targetPos, targetSize, 1, 1);

      // Update row width
      rowWidths[shortestRowIndex] = x + width + gap;
    });

    // Calculate bounds
    const maxRowWidth = Math.max(...rowWidths);
    this.bounds = {
      minX: padding,
      minY: padding,
      maxX: maxRowWidth,
      maxY: padding + rowCount * rowHeight + (rowCount - 1) * gap,
      width: maxRowWidth - padding,
      height: rowCount * rowHeight + (rowCount - 1) * gap,
    };
  }

  /**
   * Get aspect ratio for an item
   * Uses callback to get actual image dimensions if available, otherwise falls back to default
   */
  private getAspectRatio(node: LayoutNode<KoralmEvent>): number {
    // Try to get actual image aspect ratio from callback
    if (this.config.getImageAspectRatio) {
      const imageAspectRatio = this.config.getImageAspectRatio(node);
      if (imageAspectRatio !== null && imageAspectRatio > 0) {
        return imageAspectRatio;
      }
    }

    // Fallback to default aspect ratio
    return this.config.defaultAspectRatio;
  }

  getContentBounds(): MasonryBounds {
    return this.bounds;
  }

  getMetrics(): MasonryLayouterConfig {
    return { ...this.config };
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(config: Partial<MasonryLayouterConfig>): void {
    Object.assign(this.config, config);
  }
}
