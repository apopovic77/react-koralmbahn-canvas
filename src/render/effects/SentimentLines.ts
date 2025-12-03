/**
 * SentimentLines - Bezier lines connecting cards to sentiment categories
 *
 * Visual flow from each card to one of three sentiment nodes:
 * - Positive (green)
 * - Neutral (gray)
 * - Negative (red)
 *
 * Appears when zoomed out (LOD mode) with fade-in transition.
 */

import type { LayoutNode } from 'arkturian-canvas-engine/src/layout/LayoutNode';
import type { KoralmEvent } from '../../types/koralmbahn';
import type { DayAxisColumn } from '../../layouts/DayTimelinePortraitLayouter';

export type Sentiment = 'positive' | 'neutral' | 'negative';

export interface SentimentNode {
  x: number;
  y: number;
  sentiment: Sentiment;
  count: number;
  color: string;
  label: string;
}

export type LineStartMode = 'card' | 'axis' | 'axisToCard';

export interface SentimentLinesConfig {
  /** Colors for each sentiment */
  colors: {
    positive: string;
    neutral: string;
    negative: string;
  };
  /** Line opacities per sentiment (0-1) */
  lineOpacities: {
    positive: number;
    neutral: number;
    negative: number;
  };
  /** Line width */
  lineWidth: number;
  /** Opacity of lines (0-1) - legacy, use lineOpacities instead */
  lineOpacity: number;
  /** Vertical offset from top for category nodes */
  categoryNodeY: number;
  /** Size of category node circles */
  nodeRadius: number;
  /** Gap between category nodes (as fraction of canvas width) */
  nodeSpacing: number;
  /** Where lines start: 'card' = from card center, 'axis' = from above date axis, 'axisToCard' = bezier to axis point then straight line to card */
  lineStartMode: LineStartMode;
  /** Offset above axis for line start (only used when lineStartMode = 'axis') */
  axisStartOffset: number;
  /** Offset below axis where vertical line starts in 'axisToCard' mode (to avoid axis text) */
  axisToCardStartY: number;
}

const DEFAULT_CONFIG: SentimentLinesConfig = {
  colors: {
    positive: '#00ffff', // Cyan
    neutral: '#ffff00',  // Yellow
    negative: '#ff00ff', // Magenta
  },
  lineOpacities: {
    positive: 0.5,  // Cyan lines 50% opacity
    neutral: 0.5,   // Yellow lines 50% opacity
    negative: 0.8,  // Magenta lines 80% opacity
  },
  lineWidth: 8,
  lineOpacity: 0.65,
  categoryNodeY: 80,
  nodeRadius: 120, // 5x larger (was 24)
  nodeSpacing: 0.125, // 12.5% of canvas width between nodes (halved)
  lineStartMode: 'axis', // 'card' = from cards, 'axis' = from above date axis
  axisStartOffset: 25, // Y position where bezier ends (closer to axis text at ~80-90)
  axisToCardStartY: 85, // Y position below axis where vertical line starts (axis is 80px, text ends ~90px)
};

/**
 * Renders sentiment flow lines from cards to category nodes
 */
export class SentimentLinesRenderer {
  private config: SentimentLinesConfig;
  private opacity: number = 0;
  private targetOpacity: number = 0;

  constructor(config: Partial<SentimentLinesConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update visibility based on LOD state
   * @param showLines Whether lines should be visible
   * @param deltaTime Time since last frame for smooth transition
   */
  updateVisibility(showLines: boolean, deltaTime: number = 16): void {
    this.targetOpacity = showLines ? 1 : 0;

    // Smooth fade transition
    const fadeSpeed = 0.004; // per ms
    const diff = this.targetOpacity - this.opacity;

    if (Math.abs(diff) > 0.01) {
      this.opacity += Math.sign(diff) * Math.min(Math.abs(diff), fadeSpeed * deltaTime);
    } else {
      this.opacity = this.targetOpacity;
    }
  }

  /**
   * Check if lines are currently visible
   */
  isVisible(): boolean {
    return this.opacity > 0.01;
  }

  /**
   * Render sentiment lines and category nodes
   * @param isVertical - If true, sentiment nodes are on the left side (for singleColumn layout)
   */
  render(
    ctx: CanvasRenderingContext2D,
    nodes: LayoutNode<KoralmEvent>[],
    canvasWidth: number,
    _canvasHeight: number,
    viewportScale: number,
    viewportOffsetX: number,
    _viewportOffsetY: number,
    axisColumns?: DayAxisColumn[],
    isVertical: boolean = false,
  ): void {
    if (!this.isVisible() || nodes.length === 0) return;

    // Calculate category node positions (in world space, above content or left of content)
    const categoryNodes = this.calculateCategoryNodes(nodes, canvasWidth, viewportScale, viewportOffsetX, isVertical);

    // Count sentiments
    const counts = { positive: 0, neutral: 0, negative: 0 };
    nodes.forEach(node => {
      const sentiment = this.getSentiment(node.data);
      counts[sentiment]++;
    });

    // Update counts
    categoryNodes.forEach(cn => {
      cn.count = counts[cn.sentiment];
    });

    ctx.save();
    ctx.globalAlpha = this.opacity;

    // Draw lines from each card to its category
    this.drawLines(ctx, nodes, categoryNodes, axisColumns, isVertical);

    // Draw category nodes
    this.drawCategoryNodes(ctx, categoryNodes, viewportScale, isVertical);

    ctx.restore();
  }

  /**
   * Calculate positions of the 3 category nodes
   * Horizontal: Positioned at 37.5%, 50%, 62.5% of content width (above content)
   * Vertical: Positioned at 25%, 50%, 75% of content height (left of content)
   */
  private calculateCategoryNodes(
    nodes: LayoutNode<KoralmEvent>[],
    _canvasWidth: number,
    _viewportScale: number,
    _viewportOffsetX: number,
    isVertical: boolean = false,
  ): SentimentNode[] {
    // Find full content bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(node => {
      const x = node.posX.value ?? 0;
      const y = node.posY.value ?? 0;
      const width = node.width.value ?? 0;
      const height = node.height.value ?? 0;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + width);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y + height);
    });

    if (isVertical) {
      // Vertical mode: nodes on the left, clustered closer together
      const contentHeight = maxY - minY;
      const nodeX = minX - 9800; // Much further left of content

      // Position nodes closer together (40%, 50%, 60% of content height)
      const pos1 = minY + contentHeight * 0.40;
      const pos2 = minY + contentHeight * 0.50; // Center
      const pos3 = minY + contentHeight * 0.60;

      return [
        {
          x: nodeX,
          y: pos1,
          sentiment: 'positive',
          count: 0,
          color: this.config.colors.positive,
          label: 'Positiv',
        },
        {
          x: nodeX,
          y: pos2,
          sentiment: 'neutral',
          count: 0,
          color: this.config.colors.neutral,
          label: 'Neutral',
        },
        {
          x: nodeX,
          y: pos3,
          sentiment: 'negative',
          count: 0,
          color: this.config.colors.negative,
          label: 'Negativ',
        },
      ];
    } else {
      // Horizontal mode: nodes above content
      const contentWidth = maxX - minX;
      const nodeY = minY - 3000; // Far above content

      // Position nodes at 37.5%, 50%, 62.5% of content width (closer together)
      const pos1 = minX + contentWidth * 0.375;
      const pos2 = minX + contentWidth * 0.50; // Center
      const pos3 = minX + contentWidth * 0.625;

      return [
        {
          x: pos1,
          y: nodeY,
          sentiment: 'positive',
          count: 0,
          color: this.config.colors.positive,
          label: 'Positiv',
        },
        {
          x: pos2,
          y: nodeY,
          sentiment: 'neutral',
          count: 0,
          color: this.config.colors.neutral,
          label: 'Neutral',
        },
        {
          x: pos3,
          y: nodeY,
          sentiment: 'negative',
          count: 0,
          color: this.config.colors.negative,
          label: 'Negativ',
        },
      ];
    }
  }

  /**
   * Draw bezier lines from cards to category nodes
   */
  private drawLines(
    ctx: CanvasRenderingContext2D,
    nodes: LayoutNode<KoralmEvent>[],
    categoryNodes: SentimentNode[],
    axisColumns?: DayAxisColumn[],
    isVertical: boolean = false,
  ): void {
    const { lineWidth, colors, lineOpacities, lineStartMode, axisStartOffset, axisToCardStartY } = this.config;

    // Build a map of node positions to their column (for axis mode)
    const getColumnForNode = (node: LayoutNode<KoralmEvent>): DayAxisColumn | undefined => {
      if (!axisColumns || axisColumns.length === 0) return undefined;
      const nodeX = node.posX.value ?? 0;
      return axisColumns.find(col => nodeX >= col.x && nodeX < col.x + col.width);
    };

    nodes.forEach(node => {
      const sentiment = this.getSentiment(node.data);
      const categoryNode = categoryNodes.find(cn => cn.sentiment === sentiment);
      if (!categoryNode) return;

      // Skip drawing if this sentiment's line opacity is 0
      const sentimentOpacity = lineOpacities[sentiment];
      if (sentimentOpacity <= 0) return;

      // Card position (always needed)
      const cardX = node.posX.value ?? 0;
      const cardY = (node.posY.value ?? 0) + (node.height.value ?? 0) / 2;

      ctx.strokeStyle = colors[sentiment];
      ctx.lineWidth = lineWidth;
      ctx.globalAlpha = this.opacity * sentimentOpacity;

      if (isVertical) {
        // Vertical mode: horizontal bezier from card left edge to category node on left
        const midX = (cardX + categoryNode.x) / 2;
        ctx.beginPath();
        ctx.moveTo(cardX, cardY);
        ctx.bezierCurveTo(
          midX, cardY,                    // Control point 1
          midX, categoryNode.y,           // Control point 2
          categoryNode.x, categoryNode.y  // End point
        );
        ctx.stroke();
      } else {
        // Horizontal mode: original logic
        const cardCenterX = cardX + (node.width.value ?? 0) / 2;
        const cardTopY = node.posY.value ?? 0;

        // Axis point position (for axis and axisToCard modes)
        let axisPointX = cardCenterX;
        let axisPointY = axisStartOffset;

        if (axisColumns && axisColumns.length > 0) {
          const column = getColumnForNode(node);
          if (column) {
            axisPointX = column.x + column.width / 2;
          }
        }

        if (lineStartMode === 'axisToCard') {
          // Mode 3: Bezier from category node to axis point, then straight line to card
          const midY = (axisPointY + categoryNode.y) / 2;
          ctx.beginPath();
          ctx.moveTo(categoryNode.x, categoryNode.y);
          ctx.bezierCurveTo(
            categoryNode.x, midY,
            axisPointX, midY,
            axisPointX, axisPointY
          );
          ctx.stroke();

          // Part 2: Straight line from below axis text down to card
          ctx.beginPath();
          ctx.moveTo(axisPointX, axisToCardStartY);
          ctx.lineTo(cardCenterX, cardTopY);
          ctx.stroke();

        } else if (lineStartMode === 'axis' && axisColumns && axisColumns.length > 0) {
          // Mode 2: Bezier from axis point to category node
          const midY = (axisPointY + categoryNode.y) / 2;
          ctx.beginPath();
          ctx.moveTo(axisPointX, axisPointY);
          ctx.bezierCurveTo(
            axisPointX, midY,
            categoryNode.x, midY,
            categoryNode.x, categoryNode.y
          );
          ctx.stroke();

        } else {
          // Mode 1 (card): Bezier from card to category node
          const midY = (cardTopY + categoryNode.y) / 2;
          ctx.beginPath();
          ctx.moveTo(cardCenterX, cardTopY);
          ctx.bezierCurveTo(
            cardCenterX, midY,
            categoryNode.x, midY,
            categoryNode.x, categoryNode.y
          );
          ctx.stroke();
        }
      }
    });

    // Reset alpha for nodes
    ctx.globalAlpha = this.opacity;
  }

  /**
   * Draw category nodes with counts
   * @param isVertical - If true, labels are positioned left/right of circle instead of above/below
   */
  private drawCategoryNodes(
    ctx: CanvasRenderingContext2D,
    categoryNodes: SentimentNode[],
    viewportScale: number,
    isVertical: boolean = false,
  ): void {
    const { nodeRadius } = this.config;

    categoryNodes.forEach(node => {
      // Glow effect
      ctx.shadowColor = node.color;
      ctx.shadowBlur = 20;

      // Circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, nodeRadius, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();

      // Reset shadow
      ctx.shadowBlur = 0;

      // Border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (isVertical) {
        // Vertical mode: Count LEFT of circle, Label RIGHT of circle
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(70 / Math.max(viewportScale, 0.1))}px "Bricolage Grotesque", sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(node.count), node.x - nodeRadius - 30, node.y);

        // Label RIGHT of the circle
        ctx.font = `${Math.round(50 / Math.max(viewportScale, 0.1))}px "Bricolage Grotesque", sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.fillText(node.label, node.x + nodeRadius + 30, node.y);
      } else {
        // Horizontal mode: Count ABOVE, Label BELOW
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(70 / Math.max(viewportScale, 0.1))}px "Bricolage Grotesque", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(String(node.count), node.x, node.y - nodeRadius - 30);

        // Label BELOW the circle
        ctx.font = `${Math.round(50 / Math.max(viewportScale, 0.1))}px "Bricolage Grotesque", sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'top';
        ctx.fillText(node.label, node.x, node.y + nodeRadius + 30);
      }
    });
  }

  /**
   * Get sentiment from event data
   * Sentiment is a number from -1 (negative) to +1 (positive), 0 = neutral
   */
  private getSentiment(event: KoralmEvent): Sentiment {
    const sentiment = event.sentiment;

    // Handle null/undefined
    if (sentiment === null || sentiment === undefined) {
      return 'neutral';
    }

    // Numeric sentiment: -1 to +1
    if (typeof sentiment === 'number') {
      if (sentiment > 0.3) return 'positive';
      if (sentiment < -0.3) return 'negative';
      return 'neutral';
    }

    // Fallback for string sentiment (legacy)
    const sentimentStr = String(sentiment).toLowerCase();
    if (sentimentStr === 'positive' || sentimentStr === 'positiv') return 'positive';
    if (sentimentStr === 'negative' || sentimentStr === 'negativ') return 'negative';
    return 'neutral';
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<SentimentLinesConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
