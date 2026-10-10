import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ColorSample } from '../types';
import {
  polarToCanvas,
  normalizeAngle,
  easeInOutCubic,
} from '../math';

export interface ColorWheelProps {
  samples: ColorSample[];
  selectedSampleId?: string | null;
  onSelectSample?: (sample: ColorSample | null) => void;
  spokeAngles?: number[];
  harmonyName?: string;
  isPureHue?: boolean;
  onTogglePureHue?: (enabled: boolean) => void;
  size?: number;
}

export const ColorWheel: React.FC<ColorWheelProps> = ({
  samples,
  selectedSampleId,
  onSelectSample,
  spokeAngles = [],
  harmonyName,
  isPureHue: controlledIsPureHue,
  onTogglePureHue,
  size = 360,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [internalPureHue, setInternalPureHue] = useState<boolean>(false);
  const isPureHue = controlledIsPureHue !== undefined ? controlledIsPureHue : internalPureHue;

  // Animation progress: 0.0 (normal) to 1.0 (pure hue)
  const animProgressRef = useRef<number>(isPureHue ? 1.0 : 0.0);
  const animFrameIdRef = useRef<number | null>(null);

  const [hoveredSample, setHoveredSample] = useState<ColorSample | null>(null);

  const togglePureHue = () => {
    const nextState = !isPureHue;
    if (onTogglePureHue) {
      onTogglePureHue(nextState);
    } else {
      setInternalPureHue(nextState);
    }
  };

  // Mutable ref to draw function to prevent stale closures during RAF loop
  const drawRef = useRef<() => void>(() => {});

  // Animate pure hue progress
  useEffect(() => {
    const target = isPureHue ? 1.0 : 0.0;
    const durationMs = 350;
    let startTime: number | null = null;
    const startVal = animProgressRef.current;

    if (Math.abs(startVal - target) < 0.001) {
      animProgressRef.current = target;
      drawRef.current();
      return;
    }

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const t = Math.min(elapsed / durationMs, 1.0);
      const eased = easeInOutCubic(t);

      animProgressRef.current = startVal + (target - startVal) * eased;
      drawRef.current();

      if (t < 1.0) {
        animFrameIdRef.current = requestAnimationFrame(step);
      } else {
        animProgressRef.current = target;
        drawRef.current();
      }
    };

    animFrameIdRef.current = requestAnimationFrame(step);

    return () => {
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [isPureHue]);

  // Main draw function
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = size;
    const height = size;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const center = { x: width / 2, y: height / 2 };
    const padding = 28;
    const maxRadius = width / 2 - padding;

    // 1. Draw outer background dark disc
    ctx.beginPath();
    ctx.arc(center.x, center.y, maxRadius + 14, 0, 2 * Math.PI);
    ctx.fillStyle = '#0f172a';
    ctx.fill();

    // 2. Draw 360 hue wheel with conic gradient
    ctx.save();
    ctx.beginPath();
    ctx.arc(center.x, center.y, maxRadius, 0, 2 * Math.PI);
    ctx.clip();

    // 2. Draw 360 hue wheel with conic gradient or radial sweep fallback
    let renderedConic = false;
    if (typeof ctx.createConicGradient === 'function') {
      try {
        const conicGrad = ctx.createConicGradient(0, center.x, center.y);
        conicGrad.addColorStop(0 / 6, 'hsl(0, 100%, 50%)');
        conicGrad.addColorStop(1 / 6, 'hsl(60, 100%, 50%)');
        conicGrad.addColorStop(2 / 6, 'hsl(120, 100%, 50%)');
        conicGrad.addColorStop(3 / 6, 'hsl(180, 100%, 50%)');
        conicGrad.addColorStop(4 / 6, 'hsl(240, 100%, 50%)');
        conicGrad.addColorStop(5 / 6, 'hsl(300, 100%, 50%)');
        conicGrad.addColorStop(1, 'hsl(360, 100%, 50%)');
        ctx.fillStyle = conicGrad;
        ctx.fillRect(0, 0, width, height);
        renderedConic = true;
      } catch {
        renderedConic = false;
      }
    }
    if (!renderedConic) {
      // High-density angular sweep fallback for browsers/environments lacking createConicGradient
      const step = 2; // 2 degree slices
      for (let deg = 0; deg < 360; deg += step) {
        const startRad = (deg * Math.PI) / 180;
        const endRad = ((deg + step + 0.5) * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.arc(center.x, center.y, maxRadius + 1, startRad, endRad);
        ctx.closePath();
        ctx.fillStyle = `hsl(${deg}, 100%, 50%)`;
        ctx.fill();
      }
    }

    // Radial saturation falloff (center is desaturated / dark, perimeter is saturated)
    const radialGrad = ctx.createRadialGradient(
      center.x,
      center.y,
      0,
      center.x,
      center.y,
      maxRadius
    );
    radialGrad.addColorStop(0, 'rgba(15, 23, 42, 0.98)');
    radialGrad.addColorStop(0.35, 'rgba(15, 23, 42, 0.85)');
    radialGrad.addColorStop(0.7, 'rgba(15, 23, 42, 0.45)');
    radialGrad.addColorStop(1, 'rgba(15, 23, 42, 0.05)');

    ctx.fillStyle = radialGrad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    // 3. Draw concentric graticule rings (25%, 50%, 75%, 100% saturation)
    const rings = [0.25, 0.5, 0.75, 1.0];
    rings.forEach((rRatio) => {
      ctx.beginPath();
      ctx.arc(center.x, center.y, maxRadius * rRatio, 0, 2 * Math.PI);
      ctx.strokeStyle = rRatio === 1.0 ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = rRatio === 1.0 ? 1.5 : 0.8;
      if (rRatio !== 1.0) {
        ctx.setLineDash([2, 4]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // 4. Draw crosshairs & cardinal hue axes
    ctx.beginPath();
    ctx.moveTo(center.x - maxRadius, center.y);
    ctx.lineTo(center.x + maxRadius, center.y);
    ctx.moveTo(center.x, center.y - maxRadius);
    ctx.lineTo(center.x, center.y + maxRadius);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([2, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Cardinal labels
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('0° R', center.x + maxRadius + 14, center.y);
    ctx.fillText('180° C', center.x - maxRadius - 16, center.y);
    ctx.fillText('90° YG', center.x, center.y + maxRadius + 12);
    ctx.fillText('270° P', center.x, center.y - maxRadius - 12);

    // 5. Draw harmony spokes
    if (spokeAngles.length > 0) {
      // Connect spoke tips in circular angular order so multi-spoke polygons never self-intersect
      const sortedAngles = Array.from(
        new Set(spokeAngles.map((a) => normalizeAngle(a)))
      ).sort((a, b) => a - b);

      if (sortedAngles.length >= 2) {
        ctx.beginPath();
        sortedAngles.forEach((angle, idx) => {
          const pt = polarToCanvas({ theta: angle, r: 1.0 }, center, maxRadius);
          if (idx === 0) {
            ctx.moveTo(pt.x, pt.y);
          } else {
            ctx.lineTo(pt.x, pt.y);
          }
        });
        ctx.closePath();
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.fillStyle = 'rgba(245, 158, 11, 0.06)';
        ctx.fill();
        ctx.stroke();
      }

      // Draw radial spoke lines from center to perimeter
      spokeAngles.forEach((angle, idx) => {
        const pt = polarToCanvas({ theta: angle, r: 1.0 }, center, maxRadius);
        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.strokeStyle = idx === 0 ? 'rgba(251, 191, 36, 0.9)' : 'rgba(245, 158, 11, 0.65)';
        ctx.lineWidth = idx === 0 ? 2.0 : 1.2;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Small indicator circle at spoke tip
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, idx === 0 ? 4 : 3, 0, 2 * Math.PI);
        ctx.fillStyle = idx === 0 ? '#fbbf24' : '#f59e0b';
        ctx.fill();
      });
    }

    // 6. Draw sample markers
    const animP = animProgressRef.current;

    samples.forEach((sample, index) => {
      // Interpolate radius between actual saturation and 1.0 based on animP
      const baseR = sample.hsl.s;
      const targetR = 1.0;
      const currentR = baseR + (targetR - baseR) * animP;

      const pt = polarToCanvas({ theta: sample.hsl.h, r: currentR }, center, maxRadius);
      const isSelected = sample.id === selectedSampleId;
      const isHovered = hoveredSample?.id === sample.id;

      // Glow effect for selected/hovered
      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, isSelected ? 11 : 9, 0, 2 * Math.PI);
        ctx.fillStyle = isSelected ? 'rgba(56, 189, 248, 0.35)' : 'rgba(255, 255, 255, 0.25)';
        ctx.fill();
      }

      // Projection trajectory line in pure hue mode
      if (animP > 0.05 && baseR < 0.98) {
        const originPt = polarToCanvas({ theta: sample.hsl.h, r: baseR }, center, maxRadius);
        ctx.beginPath();
        ctx.moveTo(originPt.x, originPt.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.strokeStyle = `rgba(${sample.rgb.r}, ${sample.rgb.g}, ${sample.rgb.b}, ${0.5 * animP})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([1, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Marker circle
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isSelected ? 6.5 : 5, 0, 2 * Math.PI);
      ctx.fillStyle = `rgb(${sample.rgb.r}, ${sample.rgb.g}, ${sample.rgb.b})`;
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#38bdf8' : '#ffffff';
      ctx.lineWidth = isSelected ? 2.2 : 1.2;
      ctx.stroke();

      // Sample index badge
      ctx.font = 'bold 9px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${index + 1}`, pt.x, pt.y - 7);
    });

    ctx.restore();
  }, [size, samples, selectedSampleId, hoveredSample, spokeAngles]);

  // Redraw when props change & update drawRef
  useEffect(() => {
    drawRef.current = draw;
    draw();
  }, [draw]);

  // Handle canvas clicks to select a sample
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? size / rect.width : 1;
    const scaleY = rect.height > 0 ? size / rect.height : 1;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    const center = { x: size / 2, y: size / 2 };
    const padding = 28;
    const maxRadius = size / 2 - padding;
    const animP = animProgressRef.current;

    // Check hit test against samples in reverse order (topmost rendered marker selected first, hit radius: 14px)
    let foundSample: ColorSample | null = null;
    for (let i = samples.length - 1; i >= 0; i--) {
      const sample = samples[i];
      const currentR = sample.hsl.s + (1.0 - sample.hsl.s) * animP;
      const pt = polarToCanvas({ theta: sample.hsl.h, r: currentR }, center, maxRadius);
      const dist = Math.hypot(clickX - pt.x, clickY - pt.y);
      if (dist <= 14) {
        foundSample = sample;
        break;
      }
    }

    if (onSelectSample) {
      onSelectSample(foundSample);
    }
  };

  // Handle mouse move for hover tooltips
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? size / rect.width : 1;
    const scaleY = rect.height > 0 ? size / rect.height : 1;
    const moveX = (e.clientX - rect.left) * scaleX;
    const moveY = (e.clientY - rect.top) * scaleY;

    const center = { x: size / 2, y: size / 2 };
    const padding = 28;
    const maxRadius = size / 2 - padding;
    const animP = animProgressRef.current;

    let match: ColorSample | null = null;
    for (let i = samples.length - 1; i >= 0; i--) {
      const sample = samples[i];
      const currentR = sample.hsl.s + (1.0 - sample.hsl.s) * animP;
      const pt = polarToCanvas({ theta: sample.hsl.h, r: currentR }, center, maxRadius);
      const dist = Math.hypot(moveX - pt.x, moveY - pt.y);
      if (dist <= 14) {
        match = sample;
        break;
      }
    }

    setHoveredSample(match);
  };

  const handleMouseLeave = () => {
    setHoveredSample(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <canvas
          ref={canvasRef}
          style={{
            width: size,
            height: size,
            display: 'block',
            cursor: hoveredSample ? 'pointer' : 'default',
            borderRadius: '50%',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
          }}
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          data-testid="vectorscope-canvas"
        />

        {/* Hover Tooltip */}
        {hoveredSample && (
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'rgba(15, 23, 42, 0.92)',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '4px 8px',
              fontSize: '11px',
              color: '#f8fafc',
              pointerEvents: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: `rgb(${hoveredSample.rgb.r}, ${hoveredSample.rgb.g}, ${hoveredSample.rgb.b})`,
                display: 'inline-block',
                border: '1px solid #ffffff',
              }}
            />
            <strong>{hoveredSample.name}</strong>: θ={normalizeAngle(hoveredSample.hsl.h).toFixed(1)}°, r=
            {(hoveredSample.hsl.s * 100).toFixed(0)}%
          </div>
        )}
      </div>

      {/* Control Bar: Pure Hue Toggle & Spoke Info */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          maxWidth: size,
          padding: '0.4rem 0.6rem',
          backgroundColor: '#1e293b',
          borderRadius: '8px',
          border: '1px solid #334155',
          fontSize: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#94a3b8' }}>Harmony:</span>
          <span style={{ color: '#f59e0b', fontWeight: 600 }}>{harmonyName || 'None'}</span>
        </div>

        <button
          onClick={togglePureHue}
          data-testid="pure-hue-toggle"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: isPureHue ? '#3b82f6' : '#334155',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            padding: '4px 10px',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '12px',
            transition: 'background-color 0.2s',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: isPureHue ? '#93c5fd' : '#94a3b8',
            }}
          />
          Pure Hue Mode {isPureHue ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  );
};

export default ColorWheel;
