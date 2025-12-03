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

export interface DayTimelineBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface DayTimelineLayouterConfig {
  axisWidth: number;
  axisPadding: number;
  columnGap: number;
  rowGap: number;
  cardWidth: number;
  cardHeight: number;
}

const DEFAULT_CONFIG: DayTimelineLayouterConfig = {
  axisWidth: 220,
  axisPadding: 24,
  columnGap: 24,
  rowGap: 40,
  cardWidth: 260,
  cardHeight: 421, // Golden ratio portrait (1:1.618): 260 * 1.618 = 421
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

export class DayTimelineLayouter implements ILayouter<KoralmEvent> {
  private readonly config: DayTimelineLayouterConfig;
  private axisRows: DayAxisRow[] = [];
  private bounds: DayTimelineBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };

  constructor(config?: Partial<DayTimelineLayouterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  compute(nodes: LayoutNode<KoralmEvent>[], _view: { width: number; height: number }): void {
    if (nodes.length === 0) {
      this.axisRows = [];
      this.bounds = { minX: 0, minY: 0, maxX: this.config.axisWidth, maxY: 0, width: this.config.axisWidth, height: 0 };
      return;
    }

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

    const orderedGroups = Array.from(groups.values()).sort((a, b) => b.sortValue - a.sortValue);

    const rows: DayAxisRow[] = [];
    let currentY = 0;
    let contentWidth = this.config.axisWidth + this.config.axisPadding;

    orderedGroups.forEach((group, index) => {
      rows.push({
        key: group.key,
        label: group.label,
        y: currentY,
        height: this.config.cardHeight,
        eventCount: group.nodes.length,
        index,
      });

      group.nodes.sort((a, b) => {
        const aTime = a.data.publishedAt ? new Date(a.data.publishedAt).getTime() : 0;
        const bTime = b.data.publishedAt ? new Date(b.data.publishedAt).getTime() : 0;
        return bTime - aTime;
      });

      group.nodes.forEach((node, nodeIndex) => {
        const x = this.config.axisWidth + this.config.axisPadding + nodeIndex * (this.config.cardWidth + this.config.columnGap);
        const targetPos = new Vector2(x, currentY);
        const targetSize = new Vector2(this.config.cardWidth, this.config.cardHeight);
        node.setTargets(targetPos, targetSize, 1, 1);
      });

      const rowWidth = this.config.axisWidth + this.config.axisPadding + group.nodes.length * (this.config.cardWidth + this.config.columnGap);
      contentWidth = Math.max(contentWidth, rowWidth);
      currentY += this.config.cardHeight + this.config.rowGap;
    });

    if (rows.length > 0) {
      currentY -= this.config.rowGap; // remove last gap
    }

    this.axisRows = rows;
    const height = Math.max(0, currentY);
    this.bounds = {
      minX: 0,
      minY: 0,
      maxX: contentWidth,
      maxY: height,
      width: contentWidth,
      height,
    };
  }

  getAxisRows(): DayAxisRow[] {
    return this.axisRows;
  }

  getContentBounds(): DayTimelineBounds {
    return this.bounds;
  }

  getMetrics(): DayTimelineLayouterConfig {
    return { ...this.config };
  }
}
