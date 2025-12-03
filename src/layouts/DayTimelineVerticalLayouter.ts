/**
 * DayTimelineVerticalLayouter
 *
 * Vertical scrolling version with date grouping.
 * Each date is a ROW, cards are arranged HORIZONTALLY within each row.
 *
 * Layout:
 * - Vertical axis on LEFT (days as rows)
 * - Cards arranged HORIZONTALLY within each day row
 * - Scroll vertically through days
 * - Scroll horizontally through cards per day
 * - Date ordering: TOP = newest, BOTTOM = oldest
 *
 * Visual:
 * ┌─────────────┬───────────────────────────────────────┐
 * │  Mo 02.Dez  │  [Card1] [Card2] [Card3] [Card4]      │
 * │  (4 Artikel)│                                       │
 * ├─────────────┼───────────────────────────────────────┤
 * │  So 01.Dez  │  [Card1] [Card2] [Card3]              │
 * │  (3 Artikel)│                                       │
 * ├─────────────┼───────────────────────────────────────┤
 * │  Sa 30.Nov  │  [Card1] [Card2]                      │
 * │  (2 Artikel)│                                       │
 * └─────────────┴───────────────────────────────────────┘
 *       ↑                    ↑
 *  Vertical Axis      Cards per day (horizontal)
 *  (NEW at top)
 */

import { Vector2 } from 'arkturian-canvas-engine';
import type { LayoutNode } from 'arkturian-canvas-engine/src/layout/LayoutNode';
import type { ILayouter } from 'arkturian-canvas-engine/src/layout/LayoutEngine';

import type { KoralmEvent } from '../types/koralmbahn';

export interface DayAxisRow {
  key: string;
  label: string;
  y: number;
  height: number;
  eventCount: number;
  index: number;
}

export interface DayTimelineVerticalBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface DayTimelineVerticalConfig {
  /** Width of the vertical axis on left */
  axisWidth: number;

  /** Padding between axis and first card column */
  axisPadding: number;

  /** Vertical gap between day rows */
  rowGap: number;

  /** Horizontal gap between cards in a row */
  cardGap: number;

  /** Card width */
  cardWidth: number;

  /** Card height */
  cardHeight: number;

  /** Top margin before first row */
  marginTop: number;

  /** Minimum articles per row (merge single-item rows) */
  minArticlesPerRow: number;
}

const DEFAULT_CONFIG: DayTimelineVerticalConfig = {
  axisWidth: 220,
  axisPadding: 24,
  rowGap: 32,
  cardGap: 16,
  cardWidth: 260,
  cardHeight: 421, // Golden ratio portrait (1:1.618): 260 * 1.618 = 421
  marginTop: 24,
  minArticlesPerRow: 2, // Merge single-item rows into next row
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

  // Use local date for key to match the displayed label (avoid UTC timezone shift)
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const key = `${year}-${month}-${day}`;

  const formatter = new Intl.DateTimeFormat('de-AT', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });

  return { key, label: formatter.format(date), sort: date.getTime() };
}

export class DayTimelineVerticalLayouter implements ILayouter<KoralmEvent> {
  private readonly config: DayTimelineVerticalConfig;
  private axisRows: DayAxisRow[] = [];
  private bounds: DayTimelineVerticalBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };

  constructor(config?: Partial<DayTimelineVerticalConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  compute(nodes: LayoutNode<KoralmEvent>[], _view: { width: number; height: number }): void {
    if (nodes.length === 0) {
      this.axisRows = [];
      this.bounds = { minX: 0, minY: 0, maxX: this.config.axisWidth, maxY: 0, width: this.config.axisWidth, height: 0 };
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

    // Sort groups by date (newest first = top)
    const orderedGroups = Array.from(groups.values()).sort((a, b) => b.sortValue - a.sortValue);

    // PASS 2: Merge rows with fewer than minArticlesPerRow into next row
    const minPerRow = this.config.minArticlesPerRow;
    if (minPerRow > 1) {
      let hasChanges = true;
      while (hasChanges) {
        hasChanges = false;

        for (let i = 0; i < orderedGroups.length - 1; i++) {
          const currentGroup = orderedGroups[i];

          // Skip already emptied groups
          if (currentGroup.nodes.length === 0) continue;

          // If this row has fewer than min articles, merge into the next non-empty (older) row
          if (currentGroup.nodes.length < minPerRow) {
            // Find next non-empty group (going towards older)
            let nextGroupIndex = i + 1;
            while (nextGroupIndex < orderedGroups.length && orderedGroups[nextGroupIndex].nodes.length === 0) {
              nextGroupIndex++;
            }

            if (nextGroupIndex < orderedGroups.length) {
              const nextGroup = orderedGroups[nextGroupIndex];

              // Move the nodes to the next group
              nextGroup.nodes.push(...currentGroup.nodes);

              // Mark for removal
              currentGroup.nodes = [];
              hasChanges = true;
            }
          }
        }
      }
    }

    // Filter out empty groups (merged ones)
    const mergedGroups = orderedGroups.filter(g => g.nodes.length > 0);

    const rows: DayAxisRow[] = [];
    let currentY = this.config.marginTop;
    let maxContentWidth = 0;

    // Row height = card height (all cards same height per row)
    const rowHeight = this.config.cardHeight;

    mergedGroups.forEach((group, index) => {
      // Sort nodes within group by time (newest first = leftmost)
      group.nodes.sort((a, b) => {
        const aTime = a.data.publishedAt ? new Date(a.data.publishedAt).getTime() : 0;
        const bTime = b.data.publishedAt ? new Date(b.data.publishedAt).getTime() : 0;
        return bTime - aTime; // Newest first (will be at left)
      });

      // Calculate total width needed for this row's cards
      const rowCardsWidth = group.nodes.length * this.config.cardWidth +
        (group.nodes.length - 1) * this.config.cardGap;

      maxContentWidth = Math.max(maxContentWidth, rowCardsWidth);

      rows.push({
        key: group.key,
        label: group.label,
        y: currentY,
        height: rowHeight,
        eventCount: group.nodes.length,
        index,
      });

      // Position cards to the right of the axis
      // Cards start at x = axisWidth + axisPadding
      const cardsStartX = this.config.axisWidth + this.config.axisPadding;

      group.nodes.forEach((node, nodeIndex) => {
        const x = cardsStartX + nodeIndex * (this.config.cardWidth + this.config.cardGap);
        const y = currentY;

        const targetPos = new Vector2(x, y);
        const targetSize = new Vector2(this.config.cardWidth, this.config.cardHeight);
        node.setTargets(targetPos, targetSize, 1, 1);
      });

      currentY += rowHeight + this.config.rowGap;
    });

    // Remove last gap
    if (rows.length > 0) {
      currentY -= this.config.rowGap;
    }

    this.axisRows = rows;

    // Total width = card content + axis padding + axis width
    const totalWidth = maxContentWidth + this.config.axisPadding + this.config.axisWidth;

    this.bounds = {
      minX: 0,
      minY: 0,
      maxX: totalWidth,
      maxY: currentY + this.config.marginTop,
      width: totalWidth,
      height: currentY + this.config.marginTop,
    };
  }

  getAxisRows(): DayAxisRow[] {
    return this.axisRows;
  }

  getContentBounds(): DayTimelineVerticalBounds {
    return this.bounds;
  }

  getMetrics(): DayTimelineVerticalConfig {
    return { ...this.config };
  }

  /**
   * Get the X position where the axis should be drawn
   * (at the left of the content area)
   */
  getAxisX(): number {
    return 0;
  }
}
