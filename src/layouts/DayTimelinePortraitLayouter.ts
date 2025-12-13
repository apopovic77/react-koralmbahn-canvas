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

  /** Minimum articles per column (merge single-item columns) */
  minArticlesPerColumn: number;

  /** Maximum articles per column (split large columns into multiple) */
  maxArticlesPerColumn: number;

  /** Gap between sub-columns of the same day (smaller than columnGap) */
  subColumnGap: number;
}

const DEFAULT_CONFIG: DayTimelinePortraitConfig = {
  axisHeight: 80,
  axisPadding: 24,
  columnGap: 24,
  rowGap: 16,
  cardWidth: 300,
  cardHeight: 486, // Golden ratio portrait (1:1.618): 300 * 1.618 = 486
  marginLeft: 24,
  minArticlesPerColumn: 3, // Merge columns with <3 articles into next column
  maxArticlesPerColumn: 20, // Split columns with >20 articles into multiple
  subColumnGap: 12, // Half of columnGap - groups same-day sub-columns visually
};

type DayGroup = {
  key: string;
  label: string;
  sortValue: number;
  nodes: LayoutNode<KoralmEvent>[];
  isSubColumn?: boolean; // True if this is a split sub-column (not the first part)
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

    // PASS 2: Merge columns with fewer than minArticlesPerColumn into next column
    // Only run if minArticlesPerColumn > 1 (F12 toggle: ON = 2, OFF = 1)
    const minPerCol = this.config.minArticlesPerColumn;
    if (minPerCol > 1) {
      let hasChanges = true;
      while (hasChanges) {
        hasChanges = false;

        for (let i = 0; i < orderedGroups.length - 1; i++) {
          const currentGroup = orderedGroups[i];

          // Skip already emptied groups
          if (currentGroup.nodes.length === 0) continue;

          // If this column has fewer than min articles, merge into the next non-empty (newer) column
          if (currentGroup.nodes.length < minPerCol) {
            // Find next non-empty group (going towards newer)
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

    // PASS 3: Split columns with more than maxArticlesPerColumn into multiple sub-columns
    // Distribute articles evenly across sub-columns (e.g., 21 → 11 + 10, not 20 + 1)
    const maxPerCol = this.config.maxArticlesPerColumn;
    const finalGroups: DayGroup[] = [];

    for (const group of mergedGroups) {
      if (group.nodes.length <= maxPerCol) {
        // Group fits in one column - keep as is
        finalGroups.push(group);
      } else {
        // Calculate number of sub-columns needed
        const numParts = Math.ceil(group.nodes.length / maxPerCol);

        // Calculate even distribution: base size and how many get +1
        const baseSize = Math.floor(group.nodes.length / numParts);
        const extraCount = group.nodes.length % numParts;

        let currentIdx = 0;
        for (let part = 0; part < numParts; part++) {
          // First 'extraCount' columns get baseSize + 1, rest get baseSize
          const partSize = baseSize + (part < extraCount ? 1 : 0);
          const partNodes = group.nodes.slice(currentIdx, currentIdx + partSize);
          currentIdx += partSize;

          // Create label with part number: "12. Dez (1/2)", "12. Dez (2/2)"
          const partLabel = `${group.label} (${part + 1}/${numParts})`;

          finalGroups.push({
            key: `${group.key}-part${part + 1}`,
            label: partLabel,
            sortValue: group.sortValue,
            nodes: partNodes,
            isSubColumn: part > 0, // First part (part=0) is not a sub-column
          });
        }
      }
    }

    const columns: DayAxisColumn[] = [];
    let currentX = this.config.marginLeft;
    let maxContentHeight = 0;

    // Calculate the column width (card width)
    const columnWidth = this.config.cardWidth;

    finalGroups.forEach((group, index) => {
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

      // Move X position for next column
      currentX += columnWidth;

      // Add gap to next column (if there is one)
      // - subColumnGap: between sub-columns of the same day (small)
      // - columnGap * 2: before/after a multi-column day (large, to separate visually)
      // - columnGap: between single-column days (normal)
      const nextGroup = finalGroups[index + 1];
      if (nextGroup) {
        let gapToNext: number;
        if (nextGroup.isSubColumn) {
          // Next is a continuation of current day - small gap
          gapToNext = this.config.subColumnGap;
        } else {
          // Next is a new day
          // Check if current group is the last part of a split day
          const currentIsPartOfSplitDay = group.key.includes('-part');
          // Check if next group is the first part of a split day (has -part1 suffix)
          const nextIsFirstPartOfSplitDay = nextGroup.key.endsWith('-part1');

          if (currentIsPartOfSplitDay || nextIsFirstPartOfSplitDay) {
            // Before or after a multi-column day - double gap
            gapToNext = this.config.columnGap * 2;
          } else {
            // Normal gap between single-column days
            gapToNext = this.config.columnGap;
          }
        }
        currentX += gapToNext;
      }
    });

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
