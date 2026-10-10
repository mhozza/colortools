import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ColorSample } from '../types';
import { ZoomIn, ZoomOut, RotateCcw, Crosshair, Hand, Trash2, Edit3, Check } from 'lucide-react';

export interface ImagePreviewProps {
  imageUrl?: string | null;
  imageWidth?: number;
  imageHeight?: number;
  samples: ColorSample[];
  selectedSampleId?: string | null;
  onSelectSample?: (sample: ColorSample | null) => void;
  onSampleClick?: (x: number, y: number) => void;
  onUpdateSampleName?: (sampleId: string, newName: string) => void;
  onDeleteSample?: (sampleId: string) => void;
  onFileDrop?: (file: File) => void;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({
  imageUrl,
  imageWidth = 1920,
  imageHeight = 1080,
  samples,
  selectedSampleId,
  onSelectSample,
  onSampleClick,
  onUpdateSampleName,
  onDeleteSample,
  onFileDrop,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Pan & Zoom state
  const [scale, setScale] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hasMovedDuringDrag, setHasMovedDuringDrag] = useState<boolean>(false);
  const dragInitialPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Active Tool: 'sample' (eyedropper) or 'pan' (hand)
  const [activeTool, setActiveTool] = useState<'sample' | 'pan'>('sample');

  // Inline editing state for sample labels
  const [editingSampleId, setEditingSampleId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');

  // Initial fit image into container
  const resetToFit = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth: cw, clientHeight: ch } = containerRef.current;
    if (cw <= 0 || ch <= 0 || imageWidth <= 0 || imageHeight <= 0) return;

    const scaleX = (cw * 0.92) / imageWidth;
    const scaleY = (ch * 0.92) / imageHeight;
    const fitScale = Math.min(scaleX, scaleY, 1.0);

    const fitWidth = imageWidth * fitScale;
    const fitHeight = imageHeight * fitScale;

    setScale(Number(fitScale.toFixed(4)));
    setPan({
      x: Math.round((cw - fitWidth) / 2),
      y: Math.round((ch - fitHeight) / 2),
    });
  }, [imageWidth, imageHeight]);

  useEffect(() => {
    resetToFit();
  }, [imageUrl, resetToFit]);

  // Handle Zoom
  const handleZoom = (direction: 'in' | 'out', factor: number = 1.25) => {
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;

    const targetScale = direction === 'in' ? scale * factor : scale / factor;
    const clampedScale = Math.min(Math.max(targetScale, 0.01), 10.0);

    // Zoom centered on container
    const centerX = cw / 2;
    const centerY = ch / 2;
    const newPanX = centerX - ((centerX - pan.x) / scale) * clampedScale;
    const newPanY = centerY - ((centerY - pan.y) / scale) * clampedScale;

    setScale(Number(clampedScale.toFixed(4)));
    setPan({ x: Math.round(newPanX), y: Math.round(newPanY) });
  };

  // Scale and Pan refs for native listeners avoiding stale closures & impure state updaters
  const scaleRef = useRef<number>(scale);
  scaleRef.current = scale;
  const panRef = useRef<{ x: number; y: number }>(pan);
  panRef.current = pan;

  // Native non-passive wheel event listener to avoid browser warnings and prevent page scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const currentScale = scaleRef.current;
      const currentPan = panRef.current;
      const zoomDelta = e.deltaY < 0 ? 1.15 : 0.85;
      const nextScale = Math.min(Math.max(currentScale * zoomDelta, 0.01), 10.0);

      const newPanX = mouseX - ((mouseX - currentPan.x) / currentScale) * nextScale;
      const newPanY = mouseY - ((mouseY - currentPan.y) / currentScale) * nextScale;

      setScale(Number(nextScale.toFixed(4)));
      setPan({ x: Math.round(newPanX), y: Math.round(newPanY) });
    };

    container.addEventListener('wheel', onWheelNative, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheelNative);
    };
  }, []);

  // Mouse drag for pan
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only left click
    if (e.button !== 0) return;
    setIsDragging(true);
    setHasMovedDuringDrag(false);
    dragInitialPosRef.current = { x: e.clientX, y: e.clientY };
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const currentX = e.clientX - dragStart.x;
    const currentY = e.clientY - dragStart.y;
    const totalDist = Math.hypot(
      e.clientX - dragInitialPosRef.current.x,
      e.clientY - dragInitialPosRef.current.y
    );
    if (totalDist > 3) {
      setHasMovedDuringDrag(true);
    }
    setPan({ x: currentX, y: currentY });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);

    // If moved during drag, treat as pan, not a sample click
    if (hasMovedDuringDrag) {
      return;
    }

    // Do not sample if no photo is currently loaded
    if (!imageUrl) {
      return;
    }

    // Only sample if active tool is sample or if clicking directly to sample
    if (activeTool === 'sample' && onSampleClick && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Map container screen coordinates to original image pixels
      const imgX = Math.round((clickX - pan.x) / scale);
      const imgY = Math.round((clickY - pan.y) / scale);

      // Verify coordinate falls within image bounds
      if (imgX >= 0 && imgX < imageWidth && imgY >= 0 && imgY < imageHeight) {
        onSampleClick(imgX, imgY);
      }
    }
  };

  // Drag and drop image file
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (onFileDrop) {
        onFileDrop(file);
      }
    }
  };

  // Start editing sample label
  const startEditing = (sample: ColorSample, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSampleId(sample.id);
    setEditingName(sample.name);
  };

  const saveEditing = (sampleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onUpdateSampleName && editingName.trim()) {
      onUpdateSampleName(sampleId, editingName.trim());
    }
    setEditingSampleId(null);
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '380px',
        backgroundColor: '#090d16',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid #1e293b',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
      }}
      data-testid="image-preview-container"
    >
      {/* Top Toolbar */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          right: 10,
          zIndex: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        {/* Tool selector */}
        <div
          style={{
            display: 'flex',
            gap: '4px',
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(4px)',
            padding: '4px',
            borderRadius: '6px',
            border: '1px solid #334155',
            pointerEvents: 'auto',
          }}
        >
          <button
            onClick={() => setActiveTool('sample')}
            title="Sample Color Pin"
            data-testid="tool-sample"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              backgroundColor: activeTool === 'sample' ? '#3b82f6' : 'transparent',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 500,
            }}
          >
            <Crosshair size={14} />
            <span>Sample</span>
          </button>

          <button
            onClick={() => setActiveTool('pan')}
            title="Pan View"
            data-testid="tool-pan"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              backgroundColor: activeTool === 'pan' ? '#3b82f6' : 'transparent',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 500,
            }}
          >
            <Hand size={14} />
            <span>Pan</span>
          </button>
        </div>

        {/* Zoom controls & metadata badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(4px)',
            padding: '4px 8px',
            borderRadius: '6px',
            border: '1px solid #334155',
            pointerEvents: 'auto',
          }}
        >
          <span style={{ fontSize: '11px', color: '#94a3b8', marginRight: '4px' }}>
            {Math.round(scale * 100)}% ({imageWidth}×{imageHeight})
          </span>

          <button
            onClick={() => handleZoom('in')}
            title="Zoom In"
            data-testid="zoom-in-btn"
            style={{
              padding: '4px',
              backgroundColor: 'transparent',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '4px',
            }}
          >
            <ZoomIn size={14} />
          </button>

          <button
            onClick={() => handleZoom('out')}
            title="Zoom Out"
            data-testid="zoom-out-btn"
            style={{
              padding: '4px',
              backgroundColor: 'transparent',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '4px',
            }}
          >
            <ZoomOut size={14} />
          </button>

          <button
            onClick={resetToFit}
            title="Reset Zoom to Fit"
            data-testid="reset-zoom-btn"
            style={{
              padding: '4px',
              backgroundColor: 'transparent',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '4px',
            }}
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* Interactive Canvas/Viewport Area */}
      <div
        ref={containerRef}
        data-testid="image-preview-viewport"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          if (isDragging) setIsDragging(false);
        }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          position: 'relative',
          cursor: activeTool === 'pan' ? (isDragging ? 'grabbing' : 'grab') : 'crosshair',
          overflow: 'hidden',
        }}
      >
        {imageUrl ? (
          <div
            style={{
              position: 'absolute',
              transform: `translate(${pan.x}px, ${pan.y}px)`,
              width: imageWidth * scale,
              height: imageHeight * scale,
              transformOrigin: '0 0',
            }}
          >
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Photo Preview"
              draggable={false}
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
                objectFit: 'contain',
                pointerEvents: 'none',
                boxShadow: '0 0 30px rgba(0, 0, 0, 0.7)',
              }}
            />

            {/* Pins overlay rendered in image coordinate space */}
            {samples.map((sample, idx) => {
              const isSelected = sample.id === selectedSampleId;
              const isEditing = editingSampleId === sample.id;

              return (
                <div
                  key={sample.id}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                  }}
                  onMouseUp={(e) => {
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectSample?.(sample);
                  }}
                  data-testid={`sample-pin-${sample.id}`}
                  style={{
                    position: 'absolute',
                    left: sample.x * scale,
                    top: sample.y * scale,
                    transform: 'translate(-50%, -50%)',
                    zIndex: isSelected ? 15 : 10,
                    cursor: 'pointer',
                  }}
                >
                  {/* Pin Swatch Circle */}
                  <div
                    style={{
                      width: isSelected ? 18 : 14,
                      height: isSelected ? 18 : 14,
                      borderRadius: '50%',
                      backgroundColor: `rgb(${sample.rgb.r}, ${sample.rgb.g}, ${sample.rgb.b})`,
                      border: isSelected ? '2px solid #38bdf8' : '2px solid #ffffff',
                      boxShadow: isSelected
                        ? '0 0 10px #38bdf8, 0 2px 8px rgba(0,0,0,0.8)'
                        : '0 2px 6px rgba(0,0,0,0.6)',
                      transition: 'transform 0.15s, border-color 0.15s',
                    }}
                  />

                  {/* Pin Tag Label */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      marginTop: 4,
                      backgroundColor: 'rgba(15, 23, 42, 0.92)',
                      backdropFilter: 'blur(4px)',
                      border: isSelected ? '1px solid #38bdf8' : '1px solid #334155',
                      borderRadius: '4px',
                      padding: '2px 6px',
                      fontSize: '11px',
                      color: '#f8fafc',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: '#94a3b8' }}>#{idx + 1}</span>

                    {isEditing ? (
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '2px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditing(sample.id, e as any);
                            if (e.key === 'Escape') setEditingSampleId(null);
                          }}
                          autoFocus
                          style={{
                            width: '80px',
                            backgroundColor: '#1e293b',
                            color: '#ffffff',
                            border: '1px solid #3b82f6',
                            borderRadius: '3px',
                            padding: '1px 4px',
                            fontSize: '10px',
                          }}
                          data-testid="edit-sample-input"
                        />
                        <button
                          onClick={(e) => saveEditing(sample.id, e)}
                          title="Save Label"
                          data-testid="save-sample-btn"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#10b981',
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          <Check size={12} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span>{sample.name}</span>
                        {isSelected && (
                          <div style={{ display: 'flex', gap: '3px', marginLeft: 2 }}>
                            <button
                              onClick={(e) => startEditing(sample, e)}
                              title="Rename Sample"
                              data-testid={`edit-pin-${sample.id}`}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#94a3b8',
                                cursor: 'pointer',
                                padding: 0,
                              }}
                            >
                              <Edit3 size={11} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteSample?.(sample.id);
                              }}
                              title="Delete Pin"
                              data-testid={`delete-pin-${sample.id}`}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                                padding: 0,
                              }}
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              color: '#64748b',
              padding: '2rem',
              textAlign: 'center',
            }}
          >
            <Crosshair size={42} style={{ marginBottom: '1rem', color: '#475569' }} />
            <h3 style={{ color: '#cbd5e1', marginBottom: '0.5rem', fontWeight: 500 }}>
              No Photo Loaded
            </h3>
            <p style={{ fontSize: '13px', maxWidth: '340px', lineHeight: 1.5 }}>
              Drag and drop a 24MP RAW (.CR3, .ARW, .NEF, .DNG) or JPEG photo, or use the file
              selector above.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImagePreview;
