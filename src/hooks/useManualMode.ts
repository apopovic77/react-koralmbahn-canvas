import { useEffect, useRef, useState } from 'react';
import type { ViewportTransform } from 'arkturian-canvas-engine';
import type { LayoutNode } from 'arkturian-canvas-engine/src/layout/LayoutNode';
import type { KoralmEvent } from '../types/koralmbahn';

interface UseManualModeOptions {
  viewport: ViewportTransform | null;
  getLayoutNodes: () => LayoutNode<KoralmEvent>[];
  canvasWidth: number;
  canvasHeight: number;
  onManualModeStart?: () => void;
  onEventSelected?: (event: KoralmEvent | null) => void;
  inactivityTimeout?: number;
  transitionSpeed?: number;
  isKioskModeEnabled?: boolean;
}

interface UseManualModeReturn {
  isManualMode: boolean;
  manuallySelectedIndex: number | undefined;
  handleCanvasClick: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  handleCanvasRightClick: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  handleManualInteraction: () => void;
}

const DEFAULT_INACTIVITY_TIMEOUT = 60000; // 60 seconds
const DEFAULT_TRANSITION_SPEED = 0.002; // Faster animation for better visibility

export function useManualMode({
  viewport,
  getLayoutNodes,
  canvasWidth,
  canvasHeight,
  onManualModeStart,
  onEventSelected,
  inactivityTimeout = DEFAULT_INACTIVITY_TIMEOUT,
  transitionSpeed: _transitionSpeed = DEFAULT_TRANSITION_SPEED,
  isKioskModeEnabled = true,
}: UseManualModeOptions): UseManualModeReturn {
  const [isManualMode, setIsManualMode] = useState(false);
  const [manuallySelectedIndex, setManuallySelectedIndex] = useState<number | undefined>(undefined);
  const inactivityTimerRef = useRef<number | null>(null);

  // Auto-exit manual mode when kiosk mode is re-enabled via F3
  useEffect(() => {
    if (isKioskModeEnabled && isManualMode) {
      console.log('[ManualMode] Kiosk mode re-enabled - exiting manual mode');
      setIsManualMode(false);
      setManuallySelectedIndex(undefined);
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
      setManuallySelectedIndex(undefined);
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

    // Get current layout nodes
    const nodes = getLayoutNodes();
    console.log(`[ManualMode] Click at canvas (${canvasX.toFixed(0)}, ${canvasY.toFixed(0)}) -> world (${worldX.toFixed(0)}, ${worldY.toFixed(0)})`);
    console.log(`[ManualMode] Checking ${nodes.length} nodes for hit...`);

    // Find clicked node and its index
    let clickedNodeIndex = -1;
    const clickedNode = nodes.find((node, index) => {
      const x = node.posX.value ?? 0;
      const y = node.posY.value ?? 0;
      const width = node.width.value ?? 0;
      const height = node.height.value ?? 0;

      if (!width || !height) return false;
      const isHit = (
        worldX >= x &&
        worldX <= x + width &&
        worldY >= y &&
        worldY <= y + height
      );
      if (isHit) {
        clickedNodeIndex = index;
      }
      return isHit;
    });

    if (clickedNode && clickedNodeIndex >= 0) {
      const clickedEvent = clickedNode.data;
      console.log(`[ManualMode] Left-click: Zoom to event [${clickedNodeIndex}]: ${clickedEvent.title}`);

      // Switch to manual mode and track selected index
      setIsManualMode(true);
      setManuallySelectedIndex(clickedNodeIndex);

      // Notify parent (to stop kiosk timer)
      if (onManualModeStart) {
        onManualModeStart();
      }

      if (onEventSelected) {
        onEventSelected(clickedEvent);
      }

      // Zoom to event (center and fill ~80% of viewport)
      const x = clickedNode.posX.value ?? 0;
      const y = clickedNode.posY.value ?? 0;
      const width = clickedNode.width.value ?? 0;
      const height = clickedNode.height.value ?? 0;

      const centerX = x + width / 2;
      const centerY = y + height / 2;
      const targetScale = Math.min(
        (canvasWidth * 0.8) / width,
        (canvasHeight * 0.8) / height
      );

      viewport.centerOn(centerX, centerY, targetScale);

      // Start inactivity timer
      resetInactivityTimer();
    } else {
      console.log('[ManualMode] No node found at click position');
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

    // Get current layout nodes
    const nodes = getLayoutNodes();

    // Find clicked node
    const clickedNode = nodes.find((node) => {
      const x = node.posX.value ?? 0;
      const y = node.posY.value ?? 0;
      const width = node.width.value ?? 0;
      const height = node.height.value ?? 0;

      if (!width || !height) return false;
      return (
        worldX >= x &&
        worldX <= x + width &&
        worldY >= y &&
        worldY <= y + height
      );
    });

    if (clickedNode) {
      const clickedEvent = clickedNode.data;
      console.log(`[ManualMode] Right-click: Open URL for event: ${clickedEvent.title}`);

      // Open article URL in new tab
      if (clickedEvent.url) {
        // Fix malformed URLs (e.g., https://http://... or https://http%3A%2F%2F...)
        let url = clickedEvent.url;

        // Check if URL contains double protocol
        if (url.match(/^https?:\/\/https?(:|\%3A)/i)) {
          // Extract the inner URL (after the first protocol)
          const match = url.match(/^https?:\/\/(.+)$/i);
          if (match) {
            // Decode URL-encoded characters and extract the actual URL
            url = decodeURIComponent(match[1]);
            // Ensure it starts with a protocol
            if (!url.match(/^https?:\/\//i)) {
              url = 'https://' + url;
            }
          }
        }

        console.log(`[ManualMode] Opening URL: ${url}`);
        window.open(url, '_blank', 'noopener,noreferrer');
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
    manuallySelectedIndex,
    handleCanvasClick,
    handleCanvasRightClick,
    handleManualInteraction,
  };
}
