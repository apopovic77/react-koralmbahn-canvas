/**
 * DayTimelinePortraitLayouter
 *
 * Portrait/Vertical version of DayTimelineLayouter for monitors in portrait orientation.
 *
 * Layout:
 * - Horizontal axis at TOP (days as columns)
 * - Cards stacked VERTICALLY below each day
 * - Scroll horizontally through days
 * - Scroll vertically through cards per day
 * - Date ordering: LEFT = oldest, RIGHT = newest
 *
 * Visual:
 * ┌─────────────┬───────────┬───────────┬───────────────────────────┐
 * │  Sa 30.Nov  │ So 01.Dez │ Mo 02.Dez │  ← Horizontal Axis (TOP)  │
 * │  (2 Artikel)│ (3 Artikel)│ (4 Artikel)│  ← OLD → NEW            │
 * ├─────────────┼───────────┼───────────┼───────────────────────────┤
 * │  [Card1]    │  [Card1]  │  [Card1]  │                           │
 * │  [Card2]    │  [Card2]  │  [Card2]  │                           │
 * │             │  [Card3]  │  [Card3]  │                           │
 * │             │           │  [Card4]  │                           │
 * └─────────────┴───────────┴───────────┴───────────────────────────┘
 */

import { Vector2 } from 'arkturian-canvas-engine';
import type { LayoutNode } from 'arkturian-canvas-engine/src/layout/LayoutNode';
import type { ILayouter } from 'arkturian-canvas-engine/src/layout/LayoutEngine';

import type { KoralmEvent } from '../types/koralmbahn';

export interface DayAxisColumn {
  key: string;
  label: string;
  x: number;
  width: number;
  eventCount: number;
  index: number;
}

export interface DayTimelinePortraitBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface DayTimelinePortraitConfig {
  /** Height of the horizontal axis at top */
  axisHeight: number;

  /** Padding between axis and first card row */
  axisPadding: number;

  /** Horizontal gap between day columns */
  columnGap: number;

  /** Vertical gap between cards in a column */
  rowGap: number;

  /** Card width */
  cardWidth: number;

  /** Card height */
  cardHeight: number;

  /** Left margin before first column */
  marginLeft: number;
}

const DEFAULT_CONFIG: DayTimelinePortraitConfig = {
  axisHeight: 80,
  axisPadding: 24,
  columnGap: 24,
  rowGap: 16,
  cardWidth: 300,
  cardHeight: 486, // Golden ratio portrait (1:1.618): 300 * 1.618 = 486
  marginLeft: 24,
};

type DayGroup = {
  key: string;
  label: string;
  sortValue: number;
  nodes: LayoutNode<KoralmEvent>[];
};

function normalizeDate(value: string | null): { key: string; label: string; sort: number } {
  if (!value) {
    return { key: 'unknown', label: 'Unbekannt', sort: 0 };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { key: 'unknown', label: 'Unbekannt', sort: 0 };
  }

  const key = date.toISOString().slice(0, 10);
  const formatter = new Intl.DateTimeFormat('de-AT', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });

  return { key, label: formatter.format(date), sort: date.getTime() };
}

export class DayTimelinePortraitLayouter implements ILayouter<KoralmEvent> {
  private readonly config: DayTimelinePortraitConfig;
  private axisColumns: DayAxisColumn[] = [];
  private bounds: DayTimelinePortraitBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };

  constructor(config?: Partial<DayTimelinePortraitConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  compute(nodes: LayoutNode<KoralmEvent>[], _view: { width: number; height: number }): void {
    if (nodes.length === 0) {
      this.axisColumns = [];
      this.bounds = { minX: 0, minY: 0, maxX: 0, maxY: this.config.axisHeight, width: 0, height: this.config.axisHeight };
      return;
    }

    // Group events by day
    const groups = new Map<string, DayGroup>();

    nodes.forEach((node) => {
      const info = normalizeDate(node.data.publishedAt ?? null);
      const existing = groups.get(info.key);
      if (existing) {
        existing.nodes.push(node);
        existing.sortValue = Math.max(existing.sortValue, info.sort);
      } else {
        groups.set(info.key, { key: info.key, label: info.label, sortValue: info.sort, nodes: [node] });
      }
    });

    // Sort groups by date (oldest first = leftmost, newest = rightmost)
    const orderedGroups = Array.from(groups.values()).sort((a, b) => a.sortValue - b.sortValue);

    const columns: DayAxisColumn[] = [];
    let currentX = this.config.marginLeft;
    let maxContentHeight = 0;

    // Calculate the column width (card width)
    const columnWidth = this.config.cardWidth;

    orderedGroups.forEach((group, index) => {
      // Sort nodes within group by time (newest first = bottom, so oldest at top)
      group.nodes.sort((a, b) => {
        const aTime = a.data.publishedAt ? new Date(a.data.publishedAt).getTime() : 0;
        const bTime = b.data.publishedAt ? new Date(b.data.publishedAt).getTime() : 0;
        return aTime - bTime; // Oldest first (will be at top)
      });

      // Calculate total height needed for this column's cards
      const columnCardsHeight = group.nodes.length * this.config.cardHeight +
        (group.nodes.length - 1) * this.config.rowGap;

      maxContentHeight = Math.max(maxContentHeight, columnCardsHeight);

      columns.push({
        key: group.key,
        label: group.label,
        x: currentX,
        width: columnWidth,
        eventCount: group.nodes.length,
        index,
      });

      // Position cards below the axis (axis at top, cards below)
      // Cards start at y = axisHeight + axisPadding
      const cardsStartY = this.config.axisHeight + this.config.axisPadding;

      group.nodes.forEach((node, nodeIndex) => {
        const x = currentX;
        const y = cardsStartY + nodeIndex * (this.config.cardHeight + this.config.rowGap);

        const targetPos = new Vector2(x, y);
        const targetSize = new Vector2(this.config.cardWidth, this.config.cardHeight);
        node.setTargets(targetPos, targetSize, 1, 1);
      });

      currentX += columnWidth + this.config.columnGap;
    });

    // Remove last gap
    if (columns.length > 0) {
      currentX -= this.config.columnGap;
    }

    this.axisColumns = columns;

    // Total height = card content + axis padding + axis height
    const totalHeight = maxContentHeight + this.config.axisPadding + this.config.axisHeight;

    this.bounds = {
      minX: 0,
      minY: 0,
      maxX: currentX + this.config.marginLeft,
      maxY: totalHeight,
      width: currentX + this.config.marginLeft,
      height: totalHeight,
    };
  }

  getAxisColumns(): DayAxisColumn[] {
    return this.axisColumns;
  }

  getContentBounds(): DayTimelinePortraitBounds {
    return this.bounds;
  }

  getMetrics(): DayTimelinePortraitConfig {
    return { ...this.config };
  }

  /**
   * Get the Y position where the axis should be drawn
   * (at the top of the content area)
   */
  getAxisY(): number {
    return 0;
  }
}
