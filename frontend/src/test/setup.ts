import '@testing-library/jest-dom';

// Mock HTMLCanvasElement.prototype.getContext for JSDOM environment
HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string) {
  if (contextId === '2d') {
    return {
      canvas: this,
      save: () => {},
      restore: () => {},
      scale: () => {},
      clearRect: () => {},
      beginPath: () => {},
      closePath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      moveTo: () => {},
      lineTo: () => {},
      clip: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      fillText: () => {},
      setLineDash: () => {},
      createConicGradient: () => ({
        addColorStop: () => {},
      }),
      createRadialGradient: () => ({
        addColorStop: () => {},
      }),
      createLinearGradient: () => ({
        addColorStop: () => {},
      }),
      measureText: () => ({ width: 0 }),
    } as unknown as CanvasRenderingContext2D;
  }
  return null;
} as any;
