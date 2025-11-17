import { useEffect, useRef, useState } from 'react';
import type { ViewportTransform } from 'arkturian-canvas-engine';
import type { KoralmEvent } from '../types/koralmbahn';

interface UseManualModeOptions {
  viewport: ViewportTransform | null;
  events: KoralmEvent[];
  canvasWidth: number;
  canvasHeight: number;
  onManualModeStart?: () => void;
  inactivityTimeout?: number;
  transitionSpeed?: number;
  isKioskModeEnabled?: boolean;
}

interface UseManualModeReturn {
  isManualMode: boolean;
  handleCanvasClick: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  handleCanvasRightClick: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  handleManualInteraction: () => void;
}

const DEFAULT_INACTIVITY_TIMEOUT = 60000; // 60 seconds
const DEFAULT_TRANSITION_SPEED = 0.002; // Faster animation for better visibility

export function useManualMode({
  viewport,
  events,
  canvasWidth,
  canvasHeight,
  onManualModeStart,
  inactivityTimeout = DEFAULT_INACTIVITY_TIMEOUT,
  transitionSpeed: _transitionSpeed = DEFAULT_TRANSITION_SPEED,
  isKioskModeEnabled = true,
}: UseManualModeOptions): UseManualModeReturn {
  const [isManualMode, setIsManualMode] = useState(false);
  const inactivityTimerRef = useRef<number | null>(null);

  // Auto-exit manual mode when kiosk mode is re-enabled via F3
  useEffect(() => {
    if (isKioskModeEnabled && isManualMode) {
      console.log('[ManualMode] Kiosk mode re-enabled - exiting manual mode');
      setIsManualMode(false);
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current);
      }
    }
  }, [isKioskModeEnabled]);

  const resetInactivityTimer = () => {
    // Clear existing timer
    if (inactivityTimerRef.current !== null) {
      window.clearTimeout(inactivityTimerRef.current);
    }

    // Start new timer
    inactivityTimerRef.current = window.setTimeout(() => {
      console.log('[ManualMode] Inactivity timeout - returning to auto mode');
      setIsManualMode(false);
    }, inactivityTimeout);
  };

  const handleManualInteraction = () => {
    if (!isManualMode) {
      // First manual interaction - switch to manual mode
      setIsManualMode(true);

      // Notify parent (to stop kiosk timer)
      if (onManualModeStart) {
        onManualModeStart();
      }
    }

    // Reset inactivity timer
    resetInactivityTimer();
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    console.log('[ManualMode] Canvas clicked (left)');

    if (!viewport) {
      console.log('[ManualMode] No viewport available');
      return;
    }

    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;

    // Convert canvas coordinates to world coordinates
    const worldPos = viewport.screenToWorld(canvasX, canvasY);
    const worldX = worldPos.x;
    const worldY = worldPos.y;

    console.log(`[ManualMode] Click at canvas (${canvasX.toFixed(0)}, ${canvasY.toFixed(0)}) -> world (${worldX.toFixed(0)}, ${worldY.toFixed(0)})`);
    console.log(`[ManualMode] Checking ${events.length} events for hit...`);

    // Find clicked event
    const clickedEvent = events.find((e) => {
      if (!e.x || !e.y || !e.width || !e.height) return false;
      return (
        worldX >= e.x &&
        worldX <= e.x + e.width &&
        worldY >= e.y &&
        worldY <= e.y + e.height
      );
    });

    if (clickedEvent) {
      console.log(`[ManualMode] Left-click: Zoom to event: ${clickedEvent.title}`);

      // Switch to manual mode
      setIsManualMode(true);

      // Notify parent (to stop kiosk timer)
      if (onManualModeStart) {
        onManualModeStart();
      }

      // Zoom to event (center and fill ~80% of viewport)
      const centerX = clickedEvent.x! + clickedEvent.width! / 2;
      const centerY = clickedEvent.y! + clickedEvent.height! / 2;
      const targetScale = Math.min(
        (canvasWidth * 0.8) / clickedEvent.width!,
        (canvasHeight * 0.8) / clickedEvent.height!
      );

      viewport.centerOn(centerX, centerY, targetScale);

      // Start inactivity timer
      resetInactivityTimer();
    } else {
      console.log('[ManualMode] No event found at click position');
    }
  };

  const handleCanvasRightClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault(); // Prevent context menu
    console.log('[ManualMode] Canvas clicked (right)');

    if (!viewport) {
      console.log('[ManualMode] No viewport available');
      return;
    }

    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;

    // Convert canvas coordinates to world coordinates
    const worldPos = viewport.screenToWorld(canvasX, canvasY);
    const worldX = worldPos.x;
    const worldY = worldPos.y;

    // Find clicked event
    const clickedEvent = events.find((e) => {
      if (!e.x || !e.y || !e.width || !e.height) return false;
      return (
        worldX >= e.x &&
        worldX <= e.x + e.width &&
        worldY >= e.y &&
        worldY <= e.y + e.height
      );
    });

    if (clickedEvent) {
      console.log(`[ManualMode] Right-click: Open URL for event: ${clickedEvent.title}`);

      // Open article URL in new tab
      if (clickedEvent.url) {
        window.open(clickedEvent.url, '_blank', 'noopener,noreferrer');
      }
    }
  };

  // Cleanup inactivity timer on unmount
  useEffect(() => {
    return () => {
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current);
      }
    };
  }, []);

  return {
    isManualMode,
    handleCanvasClick,
    handleCanvasRightClick,
    handleManualInteraction,
  };
}
