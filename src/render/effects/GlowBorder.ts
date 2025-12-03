/**
 * GlowBorder - Animated glow effect that travels around a card border
 *
 * Inspired by Apple's iOS "Lift Subject" visual effect.
 * Creates a luminous traveling highlight that traces the card perimeter.
 */

export interface GlowBorderConfig {
  /** Glow color (default: white) */
  color: string;
  /** Secondary glow color for gradient (default: cyan) */
  secondaryColor: string;
  /** Width of the glow trail (default: 3) */
  width: number;
  /** Length of the glow trail as ratio of perimeter (0-1, default: 0.15) */
  trailLength: number;
  /** Blur radius for glow effect (default: 12) */
  blur: number;
  /** Animation speed - full loops per second (default: 0.5) */
  speed: number;
  /** Border radius of the card (default: 5) */
  borderRadius: number;
}

const DEFAULT_CONFIG: GlowBorderConfig = {
  color: 'rgba(255, 255, 255, 0.9)',
  secondaryColor: 'rgba(120, 200, 255, 0.7)',
  width: 3,
  trailLength: 0.2,
  blur: 15,
  speed: 0.4,
  borderRadius: 5,
};

/**
 * Animated glow border effect for canvas cards
 */
export class GlowBorder {
  private config: GlowBorderConfig;
  private progress: number = 0;
  private lastTime: number = 0;

  constructor(config: Partial<GlowBorderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update animation progress
   * @param deltaTime Time since last frame in ms
   */
  update(deltaTime: number): void {
    // Progress goes from 0 to 1 (full loop)
    this.progress += (deltaTime / 1000) * this.config.speed;
    if (this.progress > 1) {
      this.progress -= 1;
    }
  }

  /**
   * Update with timestamp (for requestAnimationFrame)
   */
  updateWithTime(timestamp: number): void {
    if (this.lastTime === 0) {
      this.lastTime = timestamp;
      return;
    }
    const deltaTime = timestamp - this.lastTime;
    this.lastTime = timestamp;
    this.update(deltaTime);
  }

  /**
   * Reset animation
   */
  reset(): void {
    this.progress = 0;
    this.lastTime = 0;
  }

  /**
   * Render the glow border around a rectangle
   */
  render(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    borderRadius?: number,
  ): void {
    const radius = borderRadius ?? this.config.borderRadius;
    const { color, secondaryColor, width: lineWidth, trailLength, blur } = this.config;

    // Calculate perimeter for position mapping
    const perimeter = this.calculatePerimeter(width, height, radius);

    // Current position along perimeter (0-1 mapped to actual distance)
    const headPosition = this.progress * perimeter;
    // tailPosition is calculated implicitly from headPosition - (trailLength * perimeter) in the drawing loop

    ctx.save();

    // Apply glow effect
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = lineWidth;

    // Create gradient along the trail
    const segments = 20;
    const segmentLength = (trailLength * perimeter) / segments;

    for (let i = 0; i < segments; i++) {
      let segmentStart = headPosition - (i * segmentLength);
      let segmentEnd = headPosition - ((i + 1) * segmentLength);

      // Normalize to always be positive (wrap around perimeter)
      while (segmentStart < 0) segmentStart += perimeter;
      while (segmentEnd < 0) segmentEnd += perimeter;

      // Calculate opacity (fades toward tail)
      const opacity = 1 - (i / segments);

      // Interpolate color from primary to secondary
      const t = i / segments;
      ctx.strokeStyle = this.interpolateColor(color, secondaryColor, t, opacity);
      ctx.shadowColor = this.interpolateColor(color, secondaryColor, t, opacity * 0.8);

      // Draw segment - handle wrap-around case
      ctx.beginPath();
      if (segmentEnd > segmentStart) {
        // Wrapped around - draw two parts
        this.tracePathSegmentSimple(ctx, x, y, width, height, radius, 0, segmentStart, perimeter);
        ctx.stroke();
        ctx.beginPath();
        this.tracePathSegmentSimple(ctx, x, y, width, height, radius, segmentEnd, perimeter, perimeter);
      } else {
        // Normal case - draw from end to start (since we go backwards)
        this.tracePathSegmentSimple(ctx, x, y, width, height, radius, segmentEnd, segmentStart, perimeter);
      }
      ctx.stroke();
    }

    // Draw bright head
    ctx.strokeStyle = color;
    ctx.shadowBlur = blur * 1.5;
    ctx.lineWidth = lineWidth * 1.2;
    ctx.beginPath();
    const headPoint = this.getPointOnPerimeter(x, y, width, height, radius, headPosition, perimeter);
    const nearHeadPoint = this.getPointOnPerimeter(x, y, width, height, radius, headPosition - 2, perimeter);
    ctx.moveTo(nearHeadPoint.x, nearHeadPoint.y);
    ctx.lineTo(headPoint.x, headPoint.y);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Calculate total perimeter length
   */
  private calculatePerimeter(width: number, height: number, radius: number): number {
    // Straight edges + corner arcs
    const straightWidth = width - 2 * radius;
    const straightHeight = height - 2 * radius;
    const cornerArc = (Math.PI / 2) * radius; // Quarter circle per corner

    return (straightWidth * 2) + (straightHeight * 2) + (cornerArc * 4);
  }

  /**
   * Get point coordinates at a given distance along the perimeter
   */
  private getPointOnPerimeter(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    distance: number,
    perimeter: number,
  ): { x: number; y: number } {
    // Normalize distance to positive value within perimeter
    let d = distance % perimeter;
    if (d < 0) d += perimeter;

    const straightWidth = width - 2 * radius;
    const straightHeight = height - 2 * radius;
    const cornerArc = (Math.PI / 2) * radius;

    // Edge lengths in order: top, top-right corner, right, bottom-right corner, bottom, bottom-left corner, left, top-left corner
    const segments = [
      straightWidth,      // top edge
      cornerArc,          // top-right corner
      straightHeight,     // right edge
      cornerArc,          // bottom-right corner
      straightWidth,      // bottom edge
      cornerArc,          // bottom-left corner
      straightHeight,     // left edge
      cornerArc,          // top-left corner
    ];

    let accumulated = 0;
    for (let i = 0; i < segments.length; i++) {
      if (d <= accumulated + segments[i]) {
        const localD = d - accumulated;
        return this.getPointOnSegment(x, y, width, height, radius, i, localD, segments[i]);
      }
      accumulated += segments[i];
    }

    // Fallback (should never reach)
    return { x: x + radius, y };
  }

  /**
   * Get point on a specific segment
   */
  private getPointOnSegment(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    segmentIndex: number,
    localDistance: number,
    segmentLength: number,
  ): { x: number; y: number } {
    const t = segmentLength > 0 ? localDistance / segmentLength : 0;

    switch (segmentIndex) {
      case 0: // Top edge (left to right)
        return { x: x + radius + localDistance, y };

      case 1: // Top-right corner
        const angle1 = -Math.PI / 2 + (t * Math.PI / 2);
        return {
          x: x + width - radius + Math.cos(angle1) * radius,
          y: y + radius + Math.sin(angle1) * radius,
        };

      case 2: // Right edge (top to bottom)
        return { x: x + width, y: y + radius + localDistance };

      case 3: // Bottom-right corner
        const angle2 = 0 + (t * Math.PI / 2);
        return {
          x: x + width - radius + Math.cos(angle2) * radius,
          y: y + height - radius + Math.sin(angle2) * radius,
        };

      case 4: // Bottom edge (right to left)
        return { x: x + width - radius - localDistance, y: y + height };

      case 5: // Bottom-left corner
        const angle3 = Math.PI / 2 + (t * Math.PI / 2);
        return {
          x: x + radius + Math.cos(angle3) * radius,
          y: y + height - radius + Math.sin(angle3) * radius,
        };

      case 6: // Left edge (bottom to top)
        return { x, y: y + height - radius - localDistance };

      case 7: // Top-left corner
        const angle4 = Math.PI + (t * Math.PI / 2);
        return {
          x: x + radius + Math.cos(angle4) * radius,
          y: y + radius + Math.sin(angle4) * radius,
        };

      default:
        return { x, y };
    }
  }

  /**
   * Trace a simple segment (no wrap-around)
   */
  private tracePathSegmentSimple(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    startDist: number,
    endDist: number,
    perimeter: number,
  ): void {
    const steps = Math.max(2, Math.ceil((endDist - startDist) / 5));
    const stepSize = (endDist - startDist) / steps;

    const startPoint = this.getPointOnPerimeter(x, y, width, height, radius, startDist, perimeter);
    ctx.moveTo(startPoint.x, startPoint.y);

    for (let i = 1; i <= steps; i++) {
      const d = startDist + (i * stepSize);
      const point = this.getPointOnPerimeter(x, y, width, height, radius, d, perimeter);
      ctx.lineTo(point.x, point.y);
    }
  }

  /**
   * Interpolate between two colors
   */
  private interpolateColor(color1: string, color2: string, t: number, opacity: number): string {
    // Simple implementation - blend toward secondary color and apply opacity
    // For rgba colors, we parse and interpolate
    const c1 = this.parseColor(color1);
    const c2 = this.parseColor(color2);

    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const b = Math.round(c1.b + (c2.b - c1.b) * t);
    const a = (c1.a + (c2.a - c1.a) * t) * opacity;

    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  /**
   * Parse color string to RGBA object
   */
  private parseColor(color: string): { r: number; g: number; b: number; a: number } {
    // Handle rgba format
    const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (rgbaMatch) {
      return {
        r: parseInt(rgbaMatch[1]),
        g: parseInt(rgbaMatch[2]),
        b: parseInt(rgbaMatch[3]),
        a: rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1,
      };
    }

    // Handle hex format
    const hexMatch = color.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (hexMatch) {
      return {
        r: parseInt(hexMatch[1], 16),
        g: parseInt(hexMatch[2], 16),
        b: parseInt(hexMatch[3], 16),
        a: 1,
      };
    }

    // Default white
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  /**
   * Set progress directly (0-1)
   */
  setProgress(progress: number): void {
    this.progress = progress % 1;
    if (this.progress < 0) this.progress += 1;
  }

  /**
   * Get current progress
   */
  getProgress(): number {
    return this.progress;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<GlowBorderConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
