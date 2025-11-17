# React Koralmbahn Canvas Demo

Demo application showcasing [arkturian-canvas-engine](https://www.npmjs.com/package/arkturian-canvas-engine) - a high-performance canvas rendering engine with zoom, pan, and layout capabilities.

## Features

- Interactive canvas with 5 colorful demo stations
- Mouse wheel zoom (zoom in/out towards cursor)
- Right-click drag to pan (or Ctrl/Cmd + left-click)
- Touch support (pinch-to-zoom, one-finger pan)
- Smooth interpolation for buttery animations
- Grid background for spatial orientation
- Real-time zoom/pan overlay display

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

Open http://localhost:5173/ in your browser.

## Controls

- **Zoom**: Mouse wheel
- **Pan**: Right-click + drag (or Ctrl/Cmd + left-click + drag)
- **Touch**: Pinch to zoom, one-finger drag to pan

## Project Structure

```
src/
├── App.tsx          # Main demo application
├── App.css          # Styles for canvas and UI
└── main.tsx         # React entry point
```

## Using arkturian-canvas-engine

This demo shows the minimal setup needed to use the canvas engine:

```typescript
import { ViewportTransform } from 'arkturian-canvas-engine';

// 1. Create viewport transform
const viewport = new ViewportTransform(canvas);

// 2. Set content bounds
viewport.setContentBounds({
  width: 800,
  height: 600,
  minX: 0,
  minY: 0,
  maxX: 800,
  maxY: 600,
});

// 3. Update in animation loop
viewport.update();

// 4. Apply transform to canvas context
ctx.save();
viewport.applyTransform(ctx);
// ... draw your content here ...
ctx.restore();

// 5. Clean up on unmount
viewport.destroy();
```

## Important Notes

**ContentBounds must include `width` and `height`!**

```typescript
// ❌ Wrong - missing width/height
viewport.setContentBounds({
  minX: 0,
  minY: 0,
  maxX: 800,
  maxY: 600,
});

// ✅ Correct - includes width/height
viewport.setContentBounds({
  width: 800,   // Required!
  height: 600,  // Required!
  minX: 0,
  minY: 0,
  maxX: 800,
  maxY: 600,
});
```

Without `width` and `height`, scale calculations will fail (NaN values).

## License

MIT

## Related Projects

- [arkturian-canvas-engine](https://www.npmjs.com/package/arkturian-canvas-engine) - The rendering engine used in this demo
- [arkturian-typescript-utils](https://www.npmjs.com/package/arkturian-typescript-utils) - Utilities (Vector2, etc.)
