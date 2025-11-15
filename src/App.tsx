import { useEffect, useRef, useState } from 'react';
import './App.css';
import { ViewportTransform } from 'arkturian-canvas-engine';

interface DemoObject {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  label: string;
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<ViewportTransform | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Demo objects to render
  const demoObjects: DemoObject[] = [
    { id: 1, x: 100, y: 100, width: 150, height: 100, color: '#FF6B6B', label: 'Station 1' },
    { id: 2, x: 300, y: 150, width: 150, height: 100, color: '#4ECDC4', label: 'Station 2' },
    { id: 3, x: 500, y: 200, width: 150, height: 100, color: '#45B7D1', label: 'Station 3' },
    { id: 4, x: 200, y: 350, width: 150, height: 100, color: '#FFA07A', label: 'Station 4' },
    { id: 5, x: 450, y: 400, width: 150, height: 100, color: '#98D8C8', label: 'Station 5' },
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas size
    const updateCanvasSize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);

    // Initialize viewport transform (zoom/pan)
    const viewport = new ViewportTransform(canvas);
    viewportRef.current = viewport;

    // Set content bounds based on our objects
    viewport.setContentBounds({
      minX: 0,
      minY: 0,
      maxX: 800,
      maxY: 600,
    });

    // Animation loop
    const render = () => {
      if (!viewportRef.current) return;

      // Update viewport (smooth interpolation)
      viewportRef.current.update();

      // Clear canvas
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Apply viewport transform
      ctx.save();
      viewportRef.current.applyTransform(ctx);

      // Draw grid
      ctx.strokeStyle = 'rgba(200, 200, 200, 0.3)';
      ctx.lineWidth = 1;
      const gridSize = 50;
      for (let x = 0; x <= 800; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 600);
        ctx.stroke();
      }
      for (let y = 0; y <= 600; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(800, y);
        ctx.stroke();
      }

      // Draw demo objects
      demoObjects.forEach((obj) => {
        // Draw rectangle
        ctx.fillStyle = obj.color;
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
        ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);

        // Draw label
        ctx.fillStyle = '#fff';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(obj.label, obj.x + obj.width / 2, obj.y + obj.height / 2);
      });

      ctx.restore();

      // Draw UI overlay (not affected by viewport transform)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(10, 10, 280, 120);
      ctx.fillStyle = '#fff';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Koralmbahn Canvas Demo', 20, 30);
      ctx.fillText(`Zoom: ${(viewportRef.current.scale * 100).toFixed(0)}%`, 20, 55);
      ctx.fillText(`Pan: ${Math.round(viewportRef.current.offset.x)}, ${Math.round(viewportRef.current.offset.y)}`, 20, 80);
      ctx.fillText('Controls: Mouse wheel = zoom, Right-click drag = pan', 20, 105);

      animationFrameRef.current = requestAnimationFrame(render);
    };

    // Start render loop
    render();

    // Simulate loading
    setTimeout(() => {
      setIsLoading(false);
    }, 500);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      viewport.destroy();
      window.removeEventListener('resize', updateCanvasSize);
    };
  }, []);

  return (
    <div className="app-container">
      {isLoading && (
        <div className="loader">
          <div className="spinner"></div>
          <p>Loading Canvas Engine...</p>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="main-canvas"
        style={{
          display: 'block',
          width: '100vw',
          height: '100vh',
          background: '#1a1a1a',
        }}
      />
    </div>
  );
}

export default App;
