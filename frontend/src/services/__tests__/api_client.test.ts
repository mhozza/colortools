import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient, LiveWebSocketClient } from '../api_client';
import { ColorSample } from '../../types';

describe('ApiClient', () => {
  let client: ApiClient;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    client = new ApiClient({ baseUrl: 'http://127.0.0.1:8000', wsUrl: 'ws://127.0.0.1:8000/ws/live' });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('loads image preview by file path (JSON)', async () => {
    const mockResponse = {
      file_path: '/path/to/test.CR3',
      preview_url: '/api/image/preview',
      width: 6000,
      height: 4000,
      format: 'CR3',
      is_embedded_preview: true,
      extraction_time_ms: 24.5,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as unknown as Response);

    const result = await client.loadImage('/path/to/test.CR3');
    expect(globalThis.fetch).toHaveBeenCalledWith('http://127.0.0.1:8000/api/image/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_path: '/path/to/test.CR3' }),
    });
    expect(result).toEqual(mockResponse);
  });

  it('loads image preview by File upload (FormData)', async () => {
    const mockResponse = {
      file_path: 'uploaded.jpg',
      preview_url: '/api/image/preview',
      width: 1920,
      height: 1080,
      format: 'JPEG',
      is_embedded_preview: false,
      extraction_time_ms: 10.2,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as unknown as Response);

    const file = new File(['fake-content'], 'test.jpg', { type: 'image/jpeg' });
    const result = await client.loadImage(file);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/image/load',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      })
    );
    expect(result).toEqual(mockResponse);
  });

  it('clears active image session', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'cleared' }),
    } as unknown as Response);

    await client.clearImage();
    expect(globalThis.fetch).toHaveBeenCalledWith('http://127.0.0.1:8000/api/image/clear', {
      method: 'POST',
    });
  });

  it('samples pixel color coordinate', async () => {
    const mockSample: ColorSample = {
      id: 'sample-1',
      name: 'Sky Blue',
      x: 100,
      y: 150,
      rgb: { r: 100, g: 150, b: 240 },
      hsl: { h: 218.6, s: 0.82, l: 0.67 },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSample,
    } as unknown as Response);

    const result = await client.sampleColor(100, 150, 'Sky Blue');
    expect(globalThis.fetch).toHaveBeenCalledWith('http://127.0.0.1:8000/api/image/sample', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: 100, y: 150, name: 'Sky Blue' }),
    });
    expect(result).toEqual(mockSample);
  });

  it('analyzes photographic color harmonies', async () => {
    const mockAnalysis = {
      plugin: 'core_harmonies',
      sample_count: 2,
      harmonies: [
        {
          harmony_name: 'Complementary',
          match_score: 96.5,
          spoke_angles: [30, 210],
          directives: [],
        },
      ],
      top_harmony: {
        harmony_name: 'Complementary',
        match_score: 96.5,
        spoke_angles: [30, 210],
        directives: [],
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockAnalysis,
    } as unknown as Response);

    const samples: ColorSample[] = [
      {
        id: '1',
        name: 'Orange',
        x: 10,
        y: 10,
        rgb: { r: 255, g: 128, b: 0 },
        hsl: { h: 30, s: 1.0, l: 0.5 },
      },
      {
        id: '2',
        name: 'Teal',
        x: 20,
        y: 20,
        rgb: { r: 0, g: 128, b: 255 },
        hsl: { h: 210, s: 1.0, l: 0.5 },
      },
    ];

    const result = await client.analyzeHarmonies(samples, 30);
    expect(globalThis.fetch).toHaveBeenCalledWith('http://127.0.0.1:8000/api/harmony/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ samples, key_hue_override: 30 }),
    });
    expect(result).toEqual(mockAnalysis);
  });

  it('exports adjustments to Adobe Camera Raw XMP sidecar', async () => {
    const mockExport = {
      photo_path: '/path/photo.CR3',
      xmp_path: '/path/photo.xmp',
      success: true,
      adjustments_applied: { 'crs:HueAdjustmentOrange': 12 },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockExport,
    } as unknown as Response);

    const result = await client.exportXmp('/path/photo.CR3', undefined, { 'crs:HueAdjustmentOrange': 12 });
    expect(globalThis.fetch).toHaveBeenCalledWith('http://127.0.0.1:8000/api/export/xmp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        photo_path: '/path/photo.CR3',
        directives: undefined,
        adjustments: { 'crs:HueAdjustmentOrange': 12 },
      }),
    });
    expect(result).toEqual(mockExport);
  });

  it('throws descriptive error on server failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Image file not found',
    } as unknown as Response);

    await expect(client.loadImage('/nonexistent.jpg')).rejects.toThrow(
      'Failed to load image (404): Image file not found'
    );
  });
});

describe('LiveWebSocketClient', () => {
  let mockWsInstance: any;

  beforeEach(() => {
    mockWsInstance = {
      readyState: 1, // OPEN
      send: vi.fn(),
      close: vi.fn(),
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
    };

    const MockWebSocket = vi.fn().mockImplementation(() => mockWsInstance) as any;
    MockWebSocket.CONNECTING = 0;
    MockWebSocket.OPEN = 1;
    MockWebSocket.CLOSING = 2;
    MockWebSocket.CLOSED = 3;

    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('handles incoming messages and triggers status callbacks', () => {
    const onMessage = vi.fn();
    const onStatusChange = vi.fn();

    const client = new LiveWebSocketClient('ws://localhost:8000/ws/live', onMessage, onStatusChange);

    expect(onStatusChange).toHaveBeenCalledWith('connecting');

    // Simulate open
    mockWsInstance.onopen();
    expect(onStatusChange).toHaveBeenCalledWith('open');

    // Simulate message
    const testPayload = { type: 'connected', message: 'Ready' };
    mockWsInstance.onmessage({ data: JSON.stringify(testPayload) });
    expect(onMessage).toHaveBeenCalledWith(testPayload);

    // Send payload
    client.send({ type: 'ping' });
    expect(mockWsInstance.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }));

    // Disconnect
    client.disconnect();
    expect(mockWsInstance.close).toHaveBeenCalled();
  });
});
