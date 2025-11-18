import type { ViewportTransform } from 'arkturian-canvas-engine';
import type { KoralmEvent } from '../types/koralmbahn';
import type { DayAxisRow } from '../layouts/DayTimelineLayouter';

/**
 * Smart "Snap-to-Content" controller - Google Maps style!
 *
 * Allows free zoom/pan anywhere, but auto-snaps to nearest content
 * after user stops interacting (no hard borders during interaction).
 */
export class SnapToContentController {
  private lastInteractionTime = 0;
  private snapCooldown = 1000; // Wait 1s after last interaction before snapping
  private isSnapping = false;

  /**
   * Check if content is visible in current viewport.
   * Returns true if ANY content is visible.
   */
  private isContentVisible(
    viewport: ViewportTransform,
    events: KoralmEvent[],
    canvasWidth: number,
    canvasHeight: number
  ): boolean {
    if (events.length === 0) return true; // No content = always "visible"

    // Use TARGET values to avoid race condition with smooth interpolation
    // When zooming, targetScale/targetOffset change immediately, but actual values interpolate
    const targetOffset = viewport.getTargetOffset();
    const targetScale = viewport.getTargetScale();

    // Get viewport bounds in world space using TARGET values
    const viewportLeft = -targetOffset.x / targetScale;
    const viewportTop = -targetOffset.y / targetScale;
    const viewportRight = viewportLeft + canvasWidth / targetScale;
    const viewportBottom = viewportTop + canvasHeight / targetScale;

    // Check if ANY event rect intersects with viewport
    for (const event of events) {
      if (event.x === undefined || event.y === undefined) continue;

      const eventRight = event.x + (event.width || 0);
      const eventBottom = event.y + (event.height || 0);

      // AABB intersection test
      if (
        event.x < viewportRight &&
        eventRight > viewportLeft &&
        event.y < viewportBottom &&
        eventBottom > viewportTop
      ) {
        return true; // Found visible content!
      }
    }

    return false; // No content visible
  }

  /**
   * Find the nearest content region (row) to current viewport center.
   */
  private findNearestContentRegion(
    viewport: ViewportTransform,
    axisRows: DayAxisRow[],
    events: KoralmEvent[],
    canvasWidth: number,
    canvasHeight: number
  ): { centerX: number; centerY: number; targetScale: number } | null {
    if (axisRows.length === 0 && events.length === 0) return null;

    // Use TARGET values for consistency with isContentVisible check
    const targetOffset = viewport.getTargetOffset();
    const targetScale = viewport.getTargetScale();

    // Current viewport center in world space (using target values)
    const viewportCenterX = (-targetOffset.x + canvasWidth / 2) / targetScale;
    const viewportCenterY = (-targetOffset.y + canvasHeight / 2) / targetScale;

    // Find nearest row by Y distance
    let nearestRow: DayAxisRow | null = null;
    let minDistance = Infinity;

    for (const row of axisRows) {
      const rowCenterY = row.y + row.height / 2;
      const distance = Math.abs(rowCenterY - viewportCenterY);

      if (distance < minDistance) {
        minDistance = distance;
        nearestRow = row;
      }
    }

    if (!nearestRow) {
      // Fallback: Use first event if no rows
      if (events.length > 0 && events[0].x !== undefined && events[0].y !== undefined) {
        return {
          centerX: events[0].x + (events[0].width || 0) / 2,
          centerY: events[0].y + (events[0].height || 0) / 2,
          targetScale: 1,
        };
      }
      return null;
    }

    // Get events in this row
    const rowEvents = events.filter(
      (e) =>
        e.y !== undefined &&
        e.y >= nearestRow!.y &&
        e.y < nearestRow!.y + nearestRow!.height
    );

    if (rowEvents.length === 0) {
      // Empty row - snap to row center
      return {
        centerX: 500, // Default horizontal position
        centerY: nearestRow.y + nearestRow.height / 2,
        targetScale: 1,
      };
    }

    // Find nearest event in this row by X distance
    let nearestEvent: KoralmEvent | null = null;
    let minEventDistance = Infinity;

    for (const event of rowEvents) {
      if (event.x === undefined) continue;
      const eventCenterX = event.x + (event.width || 0) / 2;
      const distance = Math.abs(eventCenterX - viewportCenterX);

      if (distance < minEventDistance) {
        minEventDistance = distance;
        nearestEvent = event;
      }
    }

    if (!nearestEvent || nearestEvent.x === undefined || nearestEvent.y === undefined) {
      return null;
    }

    // Snap to nearest event center
    return {
      centerX: nearestEvent.x + (nearestEvent.width || 0) / 2,
      centerY: nearestEvent.y + (nearestEvent.height || 0) / 2,
      targetScale: 1, // Zoom level to show full event card
    };
  }

  /**
   * Called every frame to check if snap is needed.
   *
   * @param viewport - The ViewportTransform instance
   * @param events - All positioned events
   * @param axisRows - Day timeline rows (content regions)
   * @param canvasWidth - Canvas width
   * @param canvasHeight - Canvas height
   */
  update(
    viewport: ViewportTransform | null,
    events: KoralmEvent[],
    axisRows: DayAxisRow[],
    canvasWidth: number,
    canvasHeight: number
  ): void {
    if (!viewport) return;

    // Check if we're still in cooldown period after last user interaction
    const timeSinceInteraction = Date.now() - this.lastInteractionTime;
    if (timeSinceInteraction < this.snapCooldown) {
      // User recently interacted, don't snap yet
      return;
    }

    // Already snapping or content is visible
    if (this.isSnapping) return;

    const contentVisible = this.isContentVisible(viewport, events, canvasWidth, canvasHeight);
    if (contentVisible) return;

    // Content NOT visible and user inactive → SNAP!
    const nearest = this.findNearestContentRegion(viewport, axisRows, events, canvasWidth, canvasHeight);
    if (!nearest) return;

    console.log('[SnapToContent] Content lost! Snapping to nearest content:', nearest);

    this.isSnapping = true;
    viewport.centerOn(nearest.centerX, nearest.centerY, nearest.targetScale);

    // Reset snap flag after animation completes (assume ~1s for smooth interpolation)
    setTimeout(() => {
      this.isSnapping = false;
    }, 1000);
  }

  /**
   * Notify that user manually interacted (wheel, touch, etc.)
   */
  notifyInteraction(): void {
    this.lastInteractionTime = Date.now();
    this.isSnapping = false;
  }
}
