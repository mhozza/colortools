import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ColorWheel, ImagePreview, HarmonyPanel } from './components';
import {
  ColorSample,
  HarmonyEvaluationResult,
  ImageMetadataResponse,
  WebSocketIPCMessage,
} from './types';
import { apiClient } from './services';
import {
  circularDistance,
  signedCircularDelta,
  rgbToHsl,
  getTargetColorName,
} from './math';
import { Image, Palette, Radio, Trash2, Upload, Sparkles } from 'lucide-react';

// Calculate maximum possible closest spoke distance for a harmony wheel
function maxClosestSpokeDistance(spokes: number[]): number {
  const sorted = [...spokes].sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 0; i < sorted.length; i++) {
    const next = (i + 1) % sorted.length;
    const gap = (sorted[next] - sorted[i] + 360) % 360;
    if (gap > maxGap) maxGap = gap;
  }
  return maxGap / 2;
}

// Fallback local harmony evaluation if backend API is not running
function evaluateHarmoniesLocally(
  samples: ColorSample[],
  keyHueOverride: number | null
): HarmonyEvaluationResult[] {
  if (samples.length === 0) return [];

  const keyHue = keyHueOverride !== null ? keyHueOverride : samples[0].hsl.h;

  const configs = [
    { name: 'Complementary', spokes: [keyHue, (keyHue + 180) % 360] },
    {
      name: 'Split-Complementary',
      spokes: [keyHue, (keyHue + 150) % 360, (keyHue + 210) % 360],
    },
    {
      name: 'Triadic',
      spokes: [keyHue, (keyHue + 120) % 360, (keyHue + 240) % 360],
    },
    {
      name: 'Analogous',
      spokes: [keyHue, (keyHue + 30) % 360, (keyHue + 330) % 360],
    },
    {
      name: 'Square',
      spokes: [keyHue, (keyHue + 90) % 360, (keyHue + 180) % 360, (keyHue + 270) % 360],
    },
    {
      name: 'Tetradic',
      spokes: [keyHue, (keyHue + 90) % 360, (keyHue + 180) % 360, (keyHue + 270) % 360],
    },
  ];

  const results: HarmonyEvaluationResult[] = configs.map((cfg) => {
    const maxPossibleDist = maxClosestSpokeDistance(cfg.spokes);
    const directives = samples.map((sample) => {
      // Find nearest spoke
      let bestSpoke = cfg.spokes[0];
      let minDist = 360;
      for (const spoke of cfg.spokes) {
        const d = circularDistance(sample.hsl.h, spoke);
        if (d < minDist) {
          minDist = d;
          bestSpoke = spoke;
        }
      }
      const delta = signedCircularDelta(sample.hsl.h, bestSpoke);
      const targetColor = getTargetColorName(bestSpoke);

      return {
        sample_id: sample.id,
        sample_name: sample.name,
        current_hue: sample.hsl.h,
        target_hue: bestSpoke,
        delta_degrees: delta,
        target_color_name: targetColor,
        instruction: `Shift sample ${sample.name} ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}° toward ${targetColor} (${bestSpoke.toFixed(0)}°)`,
      };
    });

    const normDistances = directives.map((d) =>
      maxPossibleDist > 0 ? Math.min(Math.abs(d.delta_degrees) / maxPossibleDist, 1.0) : 0
    );
    const avgDeviation = normDistances.reduce((a, b) => a + b, 0) / normDistances.length;
    const score = Math.max(0, Math.min(100, (1.0 - avgDeviation) * 100));

    return {
      harmony_name: cfg.name,
      match_score: Number(score.toFixed(1)),
      spoke_angles: cfg.spokes,
      directives: directives.filter((d) => Math.abs(d.delta_degrees) > 0.05),
    };
  });

  results.sort((a, b) => b.match_score - a.match_score);
  return results;
}

export const App: React.FC = () => {
  // Image state
  const [activeImage, setActiveImage] = useState<ImageMetadataResponse | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Samples state
  const [samples, setSamples] = useState<ColorSample[]>([]);
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);

  // Vectorscope pure hue state
  const [isPureHue, setIsPureHue] = useState<boolean>(false);

  // Harmony state
  const [harmonies, setHarmonies] = useState<HarmonyEvaluationResult[]>([]);
  const [selectedHarmonyName, setSelectedHarmonyName] = useState<string | null>(null);
  const [keyHueOverride, setKeyHueOverride] = useState<number | null>(null);

  // Export state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  // WebSocket IPC connection status
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');

  // File input ref, Demo canvas ref & Mode synchronization refs
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const demoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDemoModeRef = useRef<boolean>(false);
  const loadSequenceRef = useRef<number>(0);
  const analysisSeqRef = useRef<number>(0);
  const pendingClearRef = useRef<Promise<void> | null>(null);

  // WebSocket subscription
  useEffect(() => {
    const liveClient = apiClient.createLiveClient(
      (message: WebSocketIPCMessage) => {
        if (message.type === 'image_loaded' && message.data) {
          if (isDemoModeRef.current) {
            return;
          }
          demoCanvasRef.current = null;
          setActiveImage(message.data as ImageMetadataResponse);
          setPreviewUrl(`${apiClient.getPreviewUrl()}?t=${Date.now()}`);
          setSamples([]);
          setSelectedSampleId(null);
          setExportMessage(null);
        } else if (message.type === 'color_sampled' && message.data) {
          if (isDemoModeRef.current) {
            return;
          }
          const sample = message.data as ColorSample;
          setSamples((prev) => [...prev.filter((s) => s.id !== sample.id), sample]);
        } else if (message.type === 'harmony_analyzed' && message.data) {
          if (isDemoModeRef.current) {
            return;
          }
          const res = message.data as { harmonies: HarmonyEvaluationResult[] };
          if (res.harmonies) {
            setHarmonies(res.harmonies);
          }
        } else if (message.type === 'xmp_exported' && message.data) {
          const res = message.data as { xmp_path: string };
          setExportMessage(`Exported sidecar to ${res.xmp_path}`);
        }
      },
      (status) => {
        setWsStatus(status);
      }
    );

    return () => {
      liveClient.disconnect();
    };
  }, []);

  // Run harmony analysis when samples or key hue change
  const runHarmonyAnalysis = useCallback(
    async (currentSamples: ColorSample[], keyHue: number | null) => {
      analysisSeqRef.current += 1;
      const seq = analysisSeqRef.current;

      if (currentSamples.length === 0) {
        setHarmonies([]);
        setSelectedHarmonyName(null);
        return;
      }

      try {
        const response = await apiClient.analyzeHarmonies(currentSamples, keyHue);
        if (analysisSeqRef.current !== seq) {
          return;
        }
        setHarmonies(response.harmonies);
        setSelectedHarmonyName((prev) => {
          if (prev && response.harmonies.some((h) => h.harmony_name === prev)) {
            return prev;
          }
          return response.top_harmony?.harmony_name ?? null;
        });
      } catch {
        if (analysisSeqRef.current !== seq) {
          return;
        }
        // Fallback to pure local math calculation if server is offline
        const local = evaluateHarmoniesLocally(currentSamples, keyHue);
        setHarmonies(local);
        setSelectedHarmonyName((prev) => {
          if (prev && local.some((h) => h.harmony_name === prev)) {
            return prev;
          }
          return local.length > 0 ? local[0].harmony_name : null;
        });
      }
    },
    []
  );

  useEffect(() => {
    runHarmonyAnalysis(samples, keyHueOverride);
  }, [samples, keyHueOverride, runHarmonyAnalysis]);

  // Load Image File handler
  const handleLoadFile = async (file: File) => {
    isDemoModeRef.current = false;
    demoCanvasRef.current = null;
    loadSequenceRef.current += 1;
    const seq = loadSequenceRef.current;

    // Await any pending backend session clearing from previous demo mode before loading new photo
    if (pendingClearRef.current) {
      try {
        await pendingClearRef.current;
      } catch {
        // Ignore clear failures
      }
    }

    if (loadSequenceRef.current !== seq || isDemoModeRef.current) {
      return;
    }

    try {
      const metadata = await apiClient.loadImage(file);
      if (loadSequenceRef.current !== seq || isDemoModeRef.current) {
        return;
      }
      setActiveImage(metadata);
      setPreviewUrl(`${apiClient.getPreviewUrl()}?t=${Date.now()}`);
      setSamples([]);
      setSelectedSampleId(null);
      setExportMessage(null);
    } catch {
      if (loadSequenceRef.current !== seq || isDemoModeRef.current) {
        return;
      }
      // Local fallback for standalone mode previewing
      const localUrl = URL.createObjectURL(file);
      const img = new window.Image();
      img.src = localUrl;
      img.onload = () => {
        if (loadSequenceRef.current !== seq || isDemoModeRef.current) {
          return;
        }
        demoCanvasRef.current = null;
        setActiveImage({
          file_path: file.name,
          preview_url: localUrl,
          width: img.naturalWidth || 1920,
          height: img.naturalHeight || 1080,
          format: file.name.split('.').pop()?.toUpperCase() || 'JPEG',
          is_embedded_preview: false,
          extraction_time_ms: 12.0,
        });
        setPreviewUrl(localUrl);
        setSamples([]);
        setSelectedSampleId(null);
        setExportMessage(null);
      };
      img.onerror = () => {
        if (loadSequenceRef.current !== seq || isDemoModeRef.current) {
          return;
        }
        setExportMessage(
          `Unable to decode ${file.name} locally. RAW preview extraction requires backend server.`
        );
      };
    }
  };

  // Click on image to sample pixel color
  const handleSampleClick = async (x: number, y: number) => {
    const intX = Math.round(x);
    const intY = Math.round(y);
    const sampleLabel = `Sample ${samples.length + 1}`;
    const seq = loadSequenceRef.current;

    // R1: Independent Demo Mode Sampling
    if (demoCanvasRef.current || isDemoModeRef.current) {
      let rgb: { r: number; g: number; b: number } | null = null;

      if (
        demoCanvasRef.current &&
        intX >= 0 &&
        intX < demoCanvasRef.current.width &&
        intY >= 0 &&
        intY < demoCanvasRef.current.height
      ) {
        try {
          const ctx = demoCanvasRef.current.getContext('2d');
          if (ctx) {
            const pixel = ctx.getImageData(intX, intY, 1, 1).data;
            if (pixel && pixel.length >= 4) {
              rgb = { r: pixel[0], g: pixel[1], b: pixel[2] };
            }
          }
        } catch {
          // Fallback if getImageData throws
        }
      }

      if (!rgb) {
        // Fallback demo sunset gradient synthesis
        const distSun = Math.hypot(intX - 800, intY - 550);
        if (distSun <= 90) {
          rgb = { r: 254, g: 240, b: 138 };
        } else if (intY < 700) {
          if (intY < 350) {
            const t = Math.max(0, intY) / 350;
            rgb = {
              r: Math.round(30 + t * (234 - 30)),
              g: Math.round(27 + t * (88 - 27)),
              b: Math.round(75 - t * (75 - 12)),
            };
          } else {
            const t = Math.min(1, Math.max(0, (intY - 350) / 350));
            rgb = {
              r: Math.round(234 + t * (251 - 234)),
              g: Math.round(88 + t * (191 - 88)),
              b: Math.round(12 + t * (36 - 12)),
            };
          }
        } else {
          const t = Math.min(1, Math.max(0, (intY - 700) / 300));
          rgb = {
            r: Math.round(2 + t * (15 - 2)),
            g: Math.round(132 - t * (132 - 23)),
            b: Math.round(199 - t * (199 - 42)),
          };
        }
      }

      const hsl = rgbToHsl(rgb);
      const demoSample: ColorSample = {
        id: `sample-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: sampleLabel,
        x: intX,
        y: intY,
        rgb,
        hsl,
      };
      setSamples((prev) => [...prev.filter((s) => s.id !== demoSample.id), demoSample]);
      setSelectedSampleId(demoSample.id);
      return;
    }

    // Photo mode: query backend server
    try {
      const sampled = await apiClient.sampleColor(intX, intY, sampleLabel);
      if (loadSequenceRef.current !== seq || isDemoModeRef.current) {
        return;
      }
      setSamples((prev) => [...prev.filter((s) => s.id !== sampled.id), sampled]);
      setSelectedSampleId(sampled.id);
    } catch {
      if (loadSequenceRef.current !== seq || isDemoModeRef.current) {
        return;
      }
      // Offline fallback: synthesize
      const mockRgb = {
        r: Math.min(255, Math.floor((intX / (activeImage?.width || 1920)) * 220 + 30)),
        g: Math.min(255, Math.floor((intY / (activeImage?.height || 1080)) * 200 + 40)),
        b: 160,
      };
      const mockHsl = rgbToHsl(mockRgb);
      const mockSample: ColorSample = {
        id: `sample-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: sampleLabel,
        x: intX,
        y: intY,
        rgb: mockRgb,
        hsl: mockHsl,
      };
      setSamples((prev) => [...prev.filter((s) => s.id !== mockSample.id), mockSample]);
      setSelectedSampleId(mockSample.id);
    }
  };

  // Load Demo Photo
  const handleLoadDemo = () => {
    isDemoModeRef.current = true;
    loadSequenceRef.current += 1;
    // Clear backend active image state so stale photo is not retained
    pendingClearRef.current = apiClient
      .clearImage()
      .catch(() => {})
      .finally(() => {
        pendingClearRef.current = null;
      });
    // Generate a high-contrast aesthetic demo palette on canvas
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      // Draw sunset landscape gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, 700);
      skyGrad.addColorStop(0, '#1e1b4b'); // Deep indigo
      skyGrad.addColorStop(0.5, '#ea580c'); // Warm orange
      skyGrad.addColorStop(1, '#fbbf24'); // Golden light
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, 1600, 700);

      // Ocean gradient
      const oceanGrad = ctx.createLinearGradient(0, 700, 0, 1000);
      oceanGrad.addColorStop(0, '#0284c7'); // Cyan/blue reflection
      oceanGrad.addColorStop(1, '#0f172a'); // Dark sea
      ctx.fillStyle = oceanGrad;
      ctx.fillRect(0, 700, 1600, 300);

      // Sun disc
      ctx.beginPath();
      ctx.arc(800, 550, 90, 0, 2 * Math.PI);
      ctx.fillStyle = '#fef08a';
      ctx.fill();

      demoCanvasRef.current = canvas;
    } else {
      demoCanvasRef.current = null;
    }

    let dataUrl = 'data:image/jpeg;base64,mock';
    try {
      dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    } catch {
      // Keep default dataUrl fallback
    }

    setActiveImage({
      file_path: '/photos/demo_sunset_seascape.CR3',
      preview_url: dataUrl,
      width: 1600,
      height: 1000,
      format: 'CR3',
      is_embedded_preview: true,
      extraction_time_ms: 18.4,
    });
    setPreviewUrl(dataUrl);

    // Prepopulate demo photographic samples (Complementary orange & teal harmony)
    const demoSamples: ColorSample[] = [
      {
        id: 'demo-1',
        name: 'Sky Orange',
        x: 650,
        y: 420,
        rgb: { r: 234, g: 88, b: 12 },
        hsl: { h: 21, s: 0.9, l: 0.48 },
      },
      {
        id: 'demo-2',
        name: 'Ocean Teal',
        x: 900,
        y: 820,
        rgb: { r: 2, g: 132, b: 199 },
        hsl: { h: 200, s: 0.98, l: 0.39 },
      },
      {
        id: 'demo-3',
        name: 'Sun Golden Highlight',
        x: 800,
        y: 550,
        rgb: { r: 254, g: 240, b: 138 },
        hsl: { h: 53, s: 0.97, l: 0.77 },
      },
      {
        id: 'demo-4',
        name: 'Deep Sea Shadow',
        x: 350,
        y: 920,
        rgb: { r: 15, g: 23, b: 42 },
        hsl: { h: 222, s: 0.47, l: 0.11 },
      },
    ];

    setSamples(demoSamples);
    setSelectedSampleId(demoSamples[0].id);
    setExportMessage(null);
  };

  // Export XMP
  const handleExportXmp = async () => {
    if (!activeImage?.file_path) return;
    setIsExporting(true);
    setExportMessage(null);

    const activeH =
      harmonies.find((h) => h.harmony_name === selectedHarmonyName) ||
      harmonies[0];

    // Local/demo preview export simulation
    if (
      isDemoModeRef.current ||
      activeImage.file_path.includes('demo') ||
      previewUrl?.startsWith('data:') ||
      previewUrl?.startsWith('blob:')
    ) {
      const simulatedXmp = `${activeImage.file_path.replace(/\.[^.]+$/, '')}.xmp`;
      setExportMessage(`Exported sidecar (local preview): ${simulatedXmp}`);
      setIsExporting(false);
      return;
    }

    try {
      const result = await apiClient.exportXmp(
        activeImage.file_path,
        activeH?.directives || []
      );
      setExportMessage(`Successfully written Adobe Camera Raw sidecar: ${result.xmp_path}`);
    } catch (err: any) {
      setExportMessage(`Export error: ${err?.message || String(err)}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Selected harmony spoke angles for ColorWheel overlay
  const activeHarmony =
    harmonies.find((h) => h.harmony_name === selectedHarmonyName) ||
    harmonies[0];
  const activeSpokeAngles = activeHarmony?.spoke_angles || [];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        minHeight: '100vh',
        backgroundColor: '#0b0f19',
        color: '#f8fafc',
      }}
    >
      {/* Top Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1.5rem',
          backgroundColor: '#0f172a',
          borderBottom: '1px solid #1e293b',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Palette size={22} style={{ color: '#38bdf8' }} />
          <div>
            <h1 style={{ fontSize: '16px', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
              Photographic Color Harmony Assistant
            </h1>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              Milestone 4 • Polar Vectorscope & Pure Hue Analysis
            </span>
          </div>
        </div>

        {/* Status Badges & Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* WebSocket Status */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              color: wsStatus === 'open' ? '#34d399' : '#94a3b8',
              backgroundColor: '#1e293b',
              padding: '4px 10px',
              borderRadius: '12px',
              border: '1px solid #334155',
            }}
          >
            <Radio size={12} />
            <span>IPC {wsStatus === 'open' ? 'Live' : 'Offline'}</span>
          </div>

          {/* Sample count badge */}
          <div
            style={{
              fontSize: '11px',
              color: '#38bdf8',
              backgroundColor: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              padding: '4px 10px',
              borderRadius: '12px',
              fontWeight: 500,
            }}
          >
            {samples.length} Samples
          </div>

          {/* Open Image File */}
          <input
            type="file"
            ref={fileInputRef}
            data-testid="file-input"
            style={{ display: 'none' }}
            accept=".cr3,.arw,.nef,.dng,.jpg,.jpeg,.png"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleLoadFile(e.target.files[0]);
              }
              e.target.value = '';
            }}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            data-testid="open-image-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            <Upload size={14} />
            <span>Open Photo</span>
          </button>

          {/* Demo Button */}
          <button
            onClick={handleLoadDemo}
            data-testid="load-demo-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <Sparkles size={14} />
            <span>Load Demo</span>
          </button>
        </div>
      </header>

      {/* Main Studio Workspace */}
      <main
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'minmax(400px, 1fr) 380px 380px',
          gap: '1rem',
          padding: '1rem',
          minHeight: 0,
        }}
      >
        {/* Left Column: Interactive Image Preview */}
        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            minHeight: '480px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Image size={15} style={{ color: '#94a3b8' }} />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>
                Preview & Sampling
              </span>
              {activeImage && (
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  ({activeImage.format} • {activeImage.extraction_time_ms.toFixed(1)} ms)
                </span>
              )}
            </div>

            {samples.length > 0 && (
              <button
                onClick={() => {
                  loadSequenceRef.current += 1;
                  setSamples([]);
                  setSelectedSampleId(null);
                }}
                title="Clear all sample points"
                data-testid="clear-samples-btn"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={12} />
                <span>Clear Pins</span>
              </button>
            )}
          </div>

          <div style={{ flex: 1, minHeight: '420px' }}>
            <ImagePreview
              imageUrl={previewUrl}
              imageWidth={activeImage?.width || 1920}
              imageHeight={activeImage?.height || 1080}
              samples={samples}
              selectedSampleId={selectedSampleId}
              onSelectSample={(s) => setSelectedSampleId(s?.id || null)}
              onSampleClick={handleSampleClick}
              onUpdateSampleName={(id, newName) => {
                setSamples((prev) =>
                  prev.map((s) => (s.id === id ? { ...s, name: newName } : s))
                );
              }}
              onDeleteSample={(id) => {
                setSamples((prev) => prev.filter((s) => s.id !== id));
                if (selectedSampleId === id) setSelectedSampleId(null);
              }}
              onFileDrop={handleLoadFile}
            />
          </div>
        </section>

        {/* Center Column: Polar Vectorscope Color Wheel */}
        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0f172a',
            borderRadius: '8px',
            border: '1px solid #1e293b',
            padding: '1rem',
          }}
        >
          <div style={{ width: '100%', marginBottom: '0.75rem', textAlign: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>
              Polar Vectorscope
            </span>
          </div>

          <ColorWheel
            samples={samples}
            selectedSampleId={selectedSampleId}
            onSelectSample={(s) => setSelectedSampleId(s?.id || null)}
            spokeAngles={activeSpokeAngles}
            harmonyName={activeHarmony?.harmony_name}
            isPureHue={isPureHue}
            onTogglePureHue={setIsPureHue}
            size={340}
          />
        </section>

        {/* Right Column: Harmony Panel */}
        <section style={{ display: 'flex', flexDirection: 'column' }}>
          <HarmonyPanel
            harmonies={harmonies}
            selectedHarmonyName={selectedHarmonyName}
            onSelectHarmony={(h) => setSelectedHarmonyName(h.harmony_name)}
            onExportXmp={handleExportXmp}
            isExporting={isExporting}
            exportSuccessMessage={exportMessage}
            photoPath={activeImage?.file_path}
            keyHueOverride={keyHueOverride}
            onKeyHueChange={setKeyHueOverride}
          />
        </section>
      </main>
    </div>
  );
};

export default App;
