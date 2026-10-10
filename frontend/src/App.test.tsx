import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { apiClient } from './services';
import { ColorSample } from './types';

describe('App Integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders application header, preview, vectorscope, and harmony panel', () => {
    render(<App />);

    expect(screen.getByText('Photographic Color Harmony Assistant')).toBeInTheDocument();
    expect(screen.getByText('Polar Vectorscope')).toBeInTheDocument();
    expect(screen.getByText('Color Harmonies')).toBeInTheDocument();
    expect(screen.getByTestId('open-image-btn')).toBeInTheDocument();
    expect(screen.getByTestId('load-demo-btn')).toBeInTheDocument();
  });

  it('loads demo photo and populates preview pins, vectorscope, and ranked harmonies', async () => {
    render(<App />);

    const loadDemoBtn = screen.getByTestId('load-demo-btn');
    fireEvent.click(loadDemoBtn);

    await waitFor(() => {
      // Demo samples loaded
      expect(screen.getByText('Sky Orange')).toBeInTheDocument();
      expect(screen.getByText('Ocean Teal')).toBeInTheDocument();
    });

    // Check sample badge updated
    expect(screen.getByText('4 Samples')).toBeInTheDocument();

    // Check harmony panel evaluated harmonies
    expect(screen.getByTestId('harmony-card-Complementary')).toBeInTheDocument();

    // Pure hue toggle is available and can be flipped
    const pureHueBtn = screen.getByTestId('pure-hue-toggle');
    expect(pureHueBtn).toHaveTextContent('Pure Hue Mode OFF');
    fireEvent.click(pureHueBtn);
    expect(pureHueBtn).toHaveTextContent('Pure Hue Mode ON');
  });

  it('clears all samples when Clear Pins button is clicked', async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('load-demo-btn'));
    await waitFor(() => {
      expect(screen.getByText('4 Samples')).toBeInTheDocument();
    });

    const clearBtn = screen.getByTestId('clear-samples-btn');
    fireEvent.click(clearBtn);

    expect(screen.getByText('0 Samples')).toBeInTheDocument();
    expect(screen.getByText(/Sample at least 2 points on the photo/i)).toBeInTheDocument();
  });

  it('exports sidecar when Export XMP button is clicked in demo mode', async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('load-demo-btn'));
    await waitFor(() => {
      expect(screen.getByText('4 Samples')).toBeInTheDocument();
    });

    const exportBtn = screen.getByTestId('export-xmp-btn');
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(screen.getByTestId('export-success-msg')).toBeInTheDocument();
    });
  });

  it('adjusts key hue override slider and triggers analysis update', async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('load-demo-btn'));
    await waitFor(() => {
      expect(screen.getByText('4 Samples')).toBeInTheDocument();
    });

    const slider = screen.getByTestId('key-hue-slider');
    fireEvent.change(slider, { target: { value: '180' } });

    await waitFor(() => {
      expect(screen.getByText('180°')).toBeInTheDocument();
    });
  });

  it('evaluates Analogous harmony with primary spoke 0 aligned with key hue', async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('load-demo-btn'));
    await waitFor(() => {
      expect(screen.getByText('4 Samples')).toBeInTheDocument();
    });

    const analogousCard = screen.getByTestId('harmony-card-Analogous');
    fireEvent.click(analogousCard);

    await waitFor(() => {
      expect(screen.getByText(/Adjustment Directives \(Analogous\)/i)).toBeInTheDocument();
    });
  });

  it('resets selected sample state when pins are cleared', async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('load-demo-btn'));
    await waitFor(() => {
      expect(screen.getByText('Sky Orange')).toBeInTheDocument();
    });

    // Pin 1 is selected initially in demo mode
    const pin = screen.getByTestId('sample-pin-demo-1');
    expect(pin).toBeInTheDocument();

    // Clear pins
    fireEvent.click(screen.getByTestId('clear-samples-btn'));

    expect(screen.queryByTestId('sample-pin-demo-1')).not.toBeInTheDocument();
    expect(screen.getByText('0 Samples')).toBeInTheDocument();
  });

  it('samples from demo canvas rather than stale photo when switching to demo mode', async () => {
    const photoSample: ColorSample = {
      id: 'photo-sample-1',
      name: 'Stale Photo Sample',
      x: 800,
      y: 550,
      rgb: { r: 35, g: 155, b: 45 },
      hsl: { h: 125, s: 0.63, l: 0.37 },
    };

    const loadImageSpy = vi.spyOn(apiClient, 'loadImage').mockResolvedValue({
      file_path: '/photos/landscape.CR3',
      preview_url: '/api/image/preview',
      width: 1920,
      height: 1080,
      format: 'CR3',
      is_embedded_preview: true,
      extraction_time_ms: 14.2,
    });

    const sampleColorSpy = vi.spyOn(apiClient, 'sampleColor').mockResolvedValue(photoSample);
    const clearImageSpy = vi.spyOn(apiClient, 'clearImage').mockResolvedValue();

    render(<App />);

    // 1. Load a photo
    const fileInput = screen.getByTestId('file-input');
    const fakeFile = new File(['binary-photo-data'], 'landscape.CR3', { type: 'image/x-canon-cr3' });
    fireEvent.change(fileInput, { target: { files: [fakeFile] } });

    await waitFor(() => {
      expect(loadImageSpy).toHaveBeenCalled();
    });

    // 2. Switch to Demo Mode
    const loadDemoBtn = screen.getByTestId('load-demo-btn');
    fireEvent.click(loadDemoBtn);

    await waitFor(() => {
      expect(screen.getByText('Sky Orange')).toBeInTheDocument();
      expect(clearImageSpy).toHaveBeenCalled();
    });

    // 3. Sample a point on the demo image (sun highlight at x=800, y=550)
    const viewport = screen.getByTestId('image-preview-viewport');
    Object.defineProperty(viewport, 'clientWidth', { value: 1600, configurable: true });
    Object.defineProperty(viewport, 'clientHeight', { value: 1000, configurable: true });
    Object.defineProperty(viewport, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1600, height: 1000 }),
      configurable: true,
    });

    // Click on sun disc (800, 550)
    fireEvent.mouseDown(viewport, { clientX: 800, clientY: 550, button: 0 });
    fireEvent.mouseUp(viewport, { clientX: 800, clientY: 550, button: 0 });

    await waitFor(() => {
      expect(screen.getByText('Sample 5')).toBeInTheDocument();
    });

    // Stale photo sampling on backend must NOT be queried
    expect(sampleColorSpy).not.toHaveBeenCalled();

    // Sampled pin color must match demo sunset palette (golden sun yellow #fef08a: 254, 240, 138), not photo green
    const pin5 = screen.getByTestId(/sample-pin-sample-/);
    expect(pin5).toBeInTheDocument();
    const pinSwatch = pin5.firstElementChild as HTMLElement;
    expect(pinSwatch.style.backgroundColor).toBe('rgb(254, 240, 138)');

    // 4. Clearing pins in demo mode and sampling new pins continues to extract from demo canvas
    const clearPinsBtn = screen.getByTestId('clear-samples-btn');
    fireEvent.click(clearPinsBtn);
    expect(screen.getByText('0 Samples')).toBeInTheDocument();

    fireEvent.mouseDown(viewport, { clientX: 800, clientY: 550, button: 0 });
    fireEvent.mouseUp(viewport, { clientX: 800, clientY: 550, button: 0 });

    await waitFor(() => {
      expect(screen.getByText('Sample 1')).toBeInTheDocument();
    });
    expect(sampleColorSpy).not.toHaveBeenCalled();
    const pin1 = screen.getByTestId(/sample-pin-sample-/);
    const pin1Swatch = pin1.firstElementChild as HTMLElement;
    expect(pin1Swatch.style.backgroundColor).toBe('rgb(254, 240, 138)');

    // 5. Loading a photo after demo mode accurately switches back to photo sampling
    const fakeFile2 = new File(['binary-photo-data-2'], 'new_photo.CR3', { type: 'image/x-canon-cr3' });
    fireEvent.change(fileInput, { target: { files: [fakeFile2] } });

    await waitFor(() => {
      expect(loadImageSpy).toHaveBeenCalledTimes(2);
    });

    fireEvent.mouseDown(viewport, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.mouseUp(viewport, { clientX: 100, clientY: 100, button: 0 });

    await waitFor(() => {
      expect(sampleColorSpy).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 'Sample 1');
    });
  });

  it('samples boundary coordinates (0, 0) and (1599, 999) accurately on demo canvas', async () => {
    const sampleColorSpy = vi.spyOn(apiClient, 'sampleColor');
    render(<App />);

    const loadDemoBtn = screen.getByTestId('load-demo-btn');
    fireEvent.click(loadDemoBtn);

    await waitFor(() => {
      expect(screen.getByText('Sky Orange')).toBeInTheDocument();
    });

    const viewport = screen.getByTestId('image-preview-viewport');
    Object.defineProperty(viewport, 'clientWidth', { value: 1600, configurable: true });
    Object.defineProperty(viewport, 'clientHeight', { value: 1000, configurable: true });
    Object.defineProperty(viewport, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1600, height: 1000 }),
      configurable: true,
    });

    // Clear pins
    fireEvent.click(screen.getByTestId('clear-samples-btn'));

    // Sample top-left corner (0, 0) -> Deep indigo (30, 27, 75)
    fireEvent.mouseDown(viewport, { clientX: 0, clientY: 0, button: 0 });
    fireEvent.mouseUp(viewport, { clientX: 0, clientY: 0, button: 0 });

    await waitFor(() => {
      expect(screen.getByText('Sample 1')).toBeInTheDocument();
    });
    expect(sampleColorSpy).not.toHaveBeenCalled();

    // Sample bottom-right corner (1599, 999) -> Dark sea (15, 23, 42)
    fireEvent.mouseDown(viewport, { clientX: 1599, clientY: 999, button: 0 });
    fireEvent.mouseUp(viewport, { clientX: 1599, clientY: 999, button: 0 });

    await waitFor(() => {
      expect(screen.getByText('Sample 2')).toBeInTheDocument();
    });
    expect(sampleColorSpy).not.toHaveBeenCalled();
    expect(screen.getByText('2 Samples')).toBeInTheDocument();
  });

  it('maintains demo mode when photo load completes after switching to demo mode (race condition resilience)', async () => {
    let resolvePhotoLoad: (meta: any) => void = () => {};
    const photoLoadPromise = new Promise((resolve) => {
      resolvePhotoLoad = resolve;
    });

    vi.spyOn(apiClient, 'loadImage').mockReturnValue(photoLoadPromise as any);
    const sampleColorSpy = vi.spyOn(apiClient, 'sampleColor');
    vi.spyOn(apiClient, 'clearImage').mockResolvedValue();

    render(<App />);

    // 1. User starts loading a photo
    const fileInput = screen.getByTestId('file-input');
    const fakeFile = new File(['data'], 'delayed.CR3', { type: 'image/x-canon-cr3' });
    fireEvent.change(fileInput, { target: { files: [fakeFile] } });

    // 2. User immediately clicks "Load Demo" before photo load finishes
    const loadDemoBtn = screen.getByTestId('load-demo-btn');
    fireEvent.click(loadDemoBtn);

    await waitFor(() => {
      expect(screen.getByText('Sky Orange')).toBeInTheDocument();
    });

    // 3. Now the delayed photo load resolves
    resolvePhotoLoad({
      file_path: '/photos/delayed.CR3',
      preview_url: '/api/image/preview',
      width: 1920,
      height: 1080,
      format: 'CR3',
      is_embedded_preview: true,
      extraction_time_ms: 120.0,
    });

    // Wait a tick for promises to settle
    await new Promise((r) => setTimeout(r, 20));

    // Demo samples must STILL be present
    expect(screen.getByText('Sky Orange')).toBeInTheDocument();
    expect(screen.getByText('4 Samples')).toBeInTheDocument();

    // Sampling must still sample from demo canvas, not call backend
    const viewport = screen.getByTestId('image-preview-viewport');
    Object.defineProperty(viewport, 'clientWidth', { value: 1600, configurable: true });
    Object.defineProperty(viewport, 'clientHeight', { value: 1000, configurable: true });
    Object.defineProperty(viewport, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1600, height: 1000 }),
      configurable: true,
    });

    fireEvent.mouseDown(viewport, { clientX: 800, clientY: 550, button: 0 });
    fireEvent.mouseUp(viewport, { clientX: 800, clientY: 550, button: 0 });

    await waitFor(() => {
      expect(screen.getByText('Sample 5')).toBeInTheDocument();
    });
    expect(sampleColorSpy).not.toHaveBeenCalled();
  });

  it('discards in-flight photo color samples when switching to demo mode', async () => {
    let resolvePhotoSample: (sample: ColorSample) => void = () => {};
    const photoSamplePromise = new Promise<ColorSample>((resolve) => {
      resolvePhotoSample = resolve;
    });

    const loadImageSpy = vi.spyOn(apiClient, 'loadImage').mockResolvedValue({
      file_path: '/photos/photo1.CR3',
      preview_url: '/api/image/preview',
      width: 1920,
      height: 1080,
      format: 'CR3',
      is_embedded_preview: true,
      extraction_time_ms: 10.0,
    });
    vi.spyOn(apiClient, 'sampleColor').mockReturnValue(photoSamplePromise as any);
    vi.spyOn(apiClient, 'clearImage').mockResolvedValue();

    render(<App />);

    // 1. Load photo
    const fileInput = screen.getByTestId('file-input');
    const fakeFile = new File(['data'], 'photo1.CR3', { type: 'image/x-canon-cr3' });
    fireEvent.change(fileInput, { target: { files: [fakeFile] } });

    await waitFor(() => {
      expect(loadImageSpy).toHaveBeenCalled();
    });

    // 2. Click to sample photo pixel (starts in-flight sampleColor)
    const viewport = screen.getByTestId('image-preview-viewport');
    Object.defineProperty(viewport, 'clientWidth', { value: 1920, configurable: true });
    Object.defineProperty(viewport, 'clientHeight', { value: 1080, configurable: true });
    Object.defineProperty(viewport, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1920, height: 1080 }),
      configurable: true,
    });

    fireEvent.mouseDown(viewport, { clientX: 200, clientY: 200, button: 0 });
    fireEvent.mouseUp(viewport, { clientX: 200, clientY: 200, button: 0 });

    // 3. User immediately clicks "Load Demo" while sampleColor is still pending
    const loadDemoBtn = screen.getByTestId('load-demo-btn');
    fireEvent.click(loadDemoBtn);

    await waitFor(() => {
      expect(screen.getByText('Sky Orange')).toBeInTheDocument();
      expect(screen.getByText('4 Samples')).toBeInTheDocument();
    });

    // 4. In-flight sampleColor on the photo resolves
    resolvePhotoSample({
      id: 'stale-photo-sample',
      name: 'Stale Sample',
      x: 200,
      y: 200,
      rgb: { r: 10, g: 200, b: 50 },
      hsl: { h: 130, s: 0.9, l: 0.4 },
    });

    // Wait a tick for promises to settle
    await new Promise((r) => setTimeout(r, 20));

    // Stale photo sample must NOT be added to demo mode!
    expect(screen.queryByText('Stale Sample')).not.toBeInTheDocument();
    expect(screen.getByText('4 Samples')).toBeInTheDocument();
  });

  it('ignores backend color_sampled and harmony_analyzed WebSocket events when in demo mode', async () => {
    let wsCallback: ((msg: any) => void) | null = null;
    vi.spyOn(apiClient, 'createLiveClient').mockImplementation(((onMsg: any) => {
      wsCallback = onMsg;
      return {
        send: vi.fn(),
        disconnect: vi.fn(),
        getStatus: () => 'open',
      };
    }) as any);

    render(<App />);

    // Load Demo mode
    const loadDemoBtn = screen.getByTestId('load-demo-btn');
    fireEvent.click(loadDemoBtn);

    await waitFor(() => {
      expect(screen.getByText('Sky Orange')).toBeInTheDocument();
      expect(screen.getByText('4 Samples')).toBeInTheDocument();
    });

    // Simulate backend sending color_sampled event from a stale session
    wsCallback!({
      type: 'color_sampled',
      data: {
        id: 'external-stale-sample',
        name: 'External Stale Sample',
        x: 100,
        y: 100,
        rgb: { r: 50, g: 50, b: 50 },
        hsl: { h: 0, s: 0, l: 0.2 },
      },
    });

    // Simulate backend sending harmony_analyzed event with stale data
    wsCallback!({
      type: 'harmony_analyzed',
      data: {
        harmonies: [
          {
            harmony_name: 'Stale-External-Harmony',
            match_score: 99.9,
            spoke_angles: [0, 180],
            directives: [],
          },
        ],
      },
    });

    // Wait a tick
    await new Promise((r) => setTimeout(r, 20));

    // Demo samples and harmonies should NOT be contaminated
    expect(screen.queryByText('External Stale Sample')).not.toBeInTheDocument();
    expect(screen.getByText('4 Samples')).toBeInTheDocument();
    expect(screen.queryByText('Stale-External-Harmony')).not.toBeInTheDocument();
  });

  it('handles failed photo sample gracefully after switching to demo mode without contaminating demo pins', async () => {
    let rejectPhotoSample: (err: any) => void = () => {};
    const photoSamplePromise = new Promise<ColorSample>((_, reject) => {
      rejectPhotoSample = reject;
    });

    const loadImageSpy = vi.spyOn(apiClient, 'loadImage').mockResolvedValue({
      file_path: '/photos/photo1.CR3',
      preview_url: '/api/image/preview',
      width: 1920,
      height: 1080,
      format: 'CR3',
      is_embedded_preview: true,
      extraction_time_ms: 10.0,
    });
    vi.spyOn(apiClient, 'sampleColor').mockReturnValue(photoSamplePromise as any);
    vi.spyOn(apiClient, 'clearImage').mockResolvedValue();

    render(<App />);

    // 1. Load photo
    const fileInput = screen.getByTestId('file-input');
    const fakeFile = new File(['data'], 'photo1.CR3', { type: 'image/x-canon-cr3' });
    fireEvent.change(fileInput, { target: { files: [fakeFile] } });

    await waitFor(() => {
      expect(loadImageSpy).toHaveBeenCalled();
    });

    // 2. Click to sample photo pixel
    const viewport = screen.getByTestId('image-preview-viewport');
    Object.defineProperty(viewport, 'clientWidth', { value: 1920, configurable: true });
    Object.defineProperty(viewport, 'clientHeight', { value: 1080, configurable: true });
    Object.defineProperty(viewport, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1920, height: 1080 }),
      configurable: true,
    });

    fireEvent.mouseDown(viewport, { clientX: 200, clientY: 200, button: 0 });
    fireEvent.mouseUp(viewport, { clientX: 200, clientY: 200, button: 0 });

    // 3. User clicks "Load Demo" while sample is pending
    const loadDemoBtn = screen.getByTestId('load-demo-btn');
    fireEvent.click(loadDemoBtn);

    await waitFor(() => {
      expect(screen.getByText('Sky Orange')).toBeInTheDocument();
      expect(screen.getByText('4 Samples')).toBeInTheDocument();
    });

    // 4. Sample rejects (e.g. session was cleared or 400 error)
    rejectPhotoSample(new Error('Session cleared'));

    // Wait a tick
    await new Promise((r) => setTimeout(r, 20));

    // Offline fallback in catch block must NOT synthesize a sample into demo mode
    expect(screen.getByText('4 Samples')).toBeInTheDocument();
  });

  it('discards delayed harmony analysis response when samples have been cleared', async () => {
    let resolveAnalysis: (val: any) => void = () => {};
    const analysisPromise = new Promise((resolve) => {
      resolveAnalysis = resolve;
    });

    vi.spyOn(apiClient, 'analyzeHarmonies').mockReturnValue(analysisPromise as any);
    render(<App />);

    // Load demo
    fireEvent.click(screen.getByTestId('load-demo-btn'));
    await waitFor(() => {
      expect(screen.getByText('Sky Orange')).toBeInTheDocument();
    });

    // Clear pins
    fireEvent.click(screen.getByTestId('clear-samples-btn'));
    expect(screen.getByText('0 Samples')).toBeInTheDocument();
    expect(screen.getByText(/Sample at least 2 points on the photo/i)).toBeInTheDocument();

    // Delayed analysis from before clear now resolves
    resolveAnalysis({
      plugin: 'core_harmonies',
      sample_count: 4,
      harmonies: [
        {
          harmony_name: 'Ghost-Complementary',
          match_score: 95.0,
          spoke_angles: [20, 200],
          directives: [],
        },
      ],
      top_harmony: {
        harmony_name: 'Ghost-Complementary',
        match_score: 95.0,
        spoke_angles: [20, 200],
        directives: [],
      },
    });

    // Wait a tick
    await new Promise((r) => setTimeout(r, 20));

    // Ghost harmony should NOT appear
    expect(screen.queryByTestId('harmony-card-Ghost-Complementary')).not.toBeInTheDocument();
    expect(screen.getByText(/Sample at least 2 points on the photo/i)).toBeInTheDocument();
  });

  it('discards in-flight photo sample when user clicks Clear Pins', async () => {
    let resolvePhotoSample: (sample: ColorSample) => void = () => {};
    const photoSamplePromise = new Promise<ColorSample>((resolve) => {
      resolvePhotoSample = resolve;
    });

    vi.spyOn(apiClient, 'loadImage').mockResolvedValue({
      file_path: '/photos/photo1.CR3',
      preview_url: '/api/image/preview',
      width: 1920,
      height: 1080,
      format: 'CR3',
      is_embedded_preview: true,
      extraction_time_ms: 10.0,
    });

    const initialPin: ColorSample = {
      id: 'initial-pin',
      name: 'Initial Pin',
      x: 100,
      y: 100,
      rgb: { r: 100, g: 100, b: 100 },
      hsl: { h: 0, s: 0, l: 0.5 },
    };

    vi.spyOn(apiClient, 'sampleColor')
      .mockResolvedValueOnce(initialPin)
      .mockReturnValue(photoSamplePromise as any);

    render(<App />);

    // Load photo
    const fileInput = screen.getByTestId('file-input');
    const fakeFile = new File(['data'], 'photo1.CR3', { type: 'image/x-canon-cr3' });
    fireEvent.change(fileInput, { target: { files: [fakeFile] } });

    await waitFor(() => {
      expect(apiClient.loadImage).toHaveBeenCalled();
    });

    // Sample initial pixel (resolves immediately)
    const viewport = screen.getByTestId('image-preview-viewport');
    Object.defineProperty(viewport, 'clientWidth', { value: 1920, configurable: true });
    Object.defineProperty(viewport, 'clientHeight', { value: 1080, configurable: true });
    Object.defineProperty(viewport, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1920, height: 1080 }),
      configurable: true,
    });

    fireEvent.mouseDown(viewport, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.mouseUp(viewport, { clientX: 100, clientY: 100, button: 0 });

    await waitFor(() => {
      expect(screen.getByText('Initial Pin')).toBeInTheDocument();
    });

    // Sample a second pixel (in-flight)
    fireEvent.mouseDown(viewport, { clientX: 200, clientY: 200, button: 0 });
    fireEvent.mouseUp(viewport, { clientX: 200, clientY: 200, button: 0 });

    // User clicks Clear Pins while sample 2 is pending
    const clearBtn = screen.getByTestId('clear-samples-btn');
    fireEvent.click(clearBtn);
    expect(screen.getByText('0 Samples')).toBeInTheDocument();

    // Now in-flight photo sample 2 resolves
    resolvePhotoSample({
      id: 'delayed-pin-2',
      name: 'Delayed Pin 2',
      x: 200,
      y: 200,
      rgb: { r: 50, g: 150, b: 200 },
      hsl: { h: 200, s: 0.6, l: 0.5 },
    });

    // Wait a tick
    await new Promise((r) => setTimeout(r, 20));

    // Stale delayed pin must NOT be added to state!
    expect(screen.queryByText('Delayed Pin 2')).not.toBeInTheDocument();
    expect(screen.getByText('0 Samples')).toBeInTheDocument();
  });

  it('does not re-trigger analyzeHarmonies when user selects a different harmony card', async () => {
    const analyzeSpy = vi.spyOn(apiClient, 'analyzeHarmonies').mockResolvedValue({
      plugin: 'core_harmonies',
      sample_count: 4,
      harmonies: [
        {
          harmony_name: 'Complementary',
          match_score: 90.0,
          spoke_angles: [20, 200],
          directives: [],
        },
        {
          harmony_name: 'Triadic',
          match_score: 80.0,
          spoke_angles: [20, 140, 260],
          directives: [],
        },
      ],
      top_harmony: {
        harmony_name: 'Complementary',
        match_score: 90.0,
        spoke_angles: [20, 200],
        directives: [],
      },
    });

    render(<App />);

    fireEvent.click(screen.getByTestId('load-demo-btn'));
    await waitFor(() => {
      expect(analyzeSpy).toHaveBeenCalledTimes(1);
    });

    // Click on Triadic harmony card
    fireEvent.click(screen.getByTestId('harmony-card-Triadic'));

    // Wait a tick
    await new Promise((r) => setTimeout(r, 20));

    // analyzeHarmonies should NOT have been called again!
    expect(analyzeSpy).toHaveBeenCalledTimes(1);
  });

  it('handles null canvas 2D context gracefully in demo mode', async () => {
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => null) as any;

    try {
      render(<App />);
      const loadDemoBtn = screen.getByTestId('load-demo-btn');
      // Should not throw
      expect(() => fireEvent.click(loadDemoBtn)).not.toThrow();

      await waitFor(() => {
        expect(screen.getByText('Sky Orange')).toBeInTheDocument();
      });

      // Sample should use fallback gradient math
      const viewport = screen.getByTestId('image-preview-viewport');
      Object.defineProperty(viewport, 'clientWidth', { value: 1600, configurable: true });
      Object.defineProperty(viewport, 'clientHeight', { value: 1000, configurable: true });
      Object.defineProperty(viewport, 'getBoundingClientRect', {
        value: () => ({ left: 0, top: 0, width: 1600, height: 1000 }),
        configurable: true,
      });

      fireEvent.mouseDown(viewport, { clientX: 800, clientY: 550, button: 0 });
      fireEvent.mouseUp(viewport, { clientX: 800, clientY: 550, button: 0 });

      await waitFor(() => {
        expect(screen.getByText('Sample 5')).toBeInTheDocument();
      });
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetContext;
    }
  });
});
