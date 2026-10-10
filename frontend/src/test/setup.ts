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
      getImageData: (sx: number, sy: number, sw = 1, sh = 1) => {
        const data = new Uint8ClampedArray(sw * sh * 4);
        for (let i = 0; i < sw * sh; i++) {
          const px = sx + (i % sw);
          const py = sy + Math.floor(i / sw);
          // Check sun disc: center (800, 550), radius 90
          const distSun = Math.hypot(px - 800, py - 550);
          if (distSun <= 90) {
            data[i * 4] = 254;
            data[i * 4 + 1] = 240;
            data[i * 4 + 2] = 138;
            data[i * 4 + 3] = 255;
          } else if (py < 700) {
            if (py < 350) {
              const t = Math.max(0, py) / 350;
              data[i * 4] = Math.round(30 + t * (234 - 30));
              data[i * 4 + 1] = Math.round(27 + t * (88 - 27));
              data[i * 4 + 2] = Math.round(75 - t * (75 - 12));
              data[i * 4 + 3] = 255;
            } else {
              const t = Math.min(1, Math.max(0, (py - 350) / 350));
              data[i * 4] = Math.round(234 + t * (251 - 234));
              data[i * 4 + 1] = Math.round(88 + t * (191 - 88));
              data[i * 4 + 2] = Math.round(12 + t * (36 - 12));
              data[i * 4 + 3] = 255;
            }
          } else {
            const t = Math.min(1, Math.max(0, (py - 700) / 300));
            data[i * 4] = Math.round(2 + t * (15 - 2));
            data[i * 4 + 1] = Math.round(132 - t * (132 - 23));
            data[i * 4 + 2] = Math.round(199 - t * (199 - 42));
            data[i * 4 + 3] = 255;
          }
        }
        return {
          data,
          width: sw,
          height: sh,
          colorSpace: 'srgb',
        } as ImageData;
      },
    } as unknown as CanvasRenderingContext2D;
  }
  return null;
} as any;

HTMLCanvasElement.prototype.toDataURL = function () {
  return 'data:image/jpeg;base64,mock';
};
