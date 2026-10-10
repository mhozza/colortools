import {
  ColorSample,
  ExportXmpRequest,
  ExportXmpResponse,
  HarmonyAnalyzeRequest,
  HarmonyAnalyzeResponse,
  ImageMetadataResponse,
  SampleColorRequest,
  SpokeDirective,
  WebSocketIPCMessage,
} from '../types';

export interface ApiClientConfig {
  baseUrl?: string;
  wsUrl?: string;
}

export class LiveWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private onMessage: (msg: WebSocketIPCMessage) => void;
  private onStatusChange?: (status: 'connecting' | 'open' | 'closed' | 'error') => void;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;

  constructor(
    url: string,
    onMessage: (msg: WebSocketIPCMessage) => void,
    onStatusChange?: (status: 'connecting' | 'open' | 'closed' | 'error') => void
  ) {
    this.url = url;
    this.onMessage = onMessage;
    this.onStatusChange = onStatusChange;
    this.connect();
  }

  public connect(): void {
    this.shouldReconnect = true;
    this.onStatusChange?.('connecting');
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.onStatusChange?.('open');
      };

      this.ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as WebSocketIPCMessage;
          this.onMessage(parsed);
        } catch {
          // Non-JSON message fallback
          this.onMessage({ type: 'raw', data: event.data });
        }
      };

      this.ws.onclose = () => {
        this.onStatusChange?.('closed');
        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
          this.reconnectAttempts++;
          this.reconnectTimer = setTimeout(() => this.connect(), delay);
        }
      };

      this.ws.onerror = () => {
        this.onStatusChange?.('error');
      };
    } catch {
      this.onStatusChange?.('error');
    }
  }

  public send(payload: unknown): void {
    const isOpen = this.ws && (this.ws.readyState === 1 || (typeof WebSocket !== 'undefined' && this.ws.readyState === WebSocket.OPEN));
    if (isOpen) {
      this.ws?.send(JSON.stringify(payload));
    }
  }

  public ping(): void {
    this.send({ type: 'ping' });
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export class ApiClient {
  private baseUrl: string;
  private wsUrl: string;

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? '';
    if (config.wsUrl) {
      this.wsUrl = config.wsUrl;
    } else if (typeof window !== 'undefined' && window.location) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.wsUrl = `${protocol}//${window.location.host}/ws/live`;
    } else {
      this.wsUrl = 'ws://127.0.0.1:8000/ws/live';
    }
  }

  /**
   * Load image from file path (string) or File/Blob upload.
   */
  public async loadImage(source: string | File): Promise<ImageMetadataResponse> {
    const url = `${this.baseUrl}/api/image/load`;

    if (typeof source === 'string') {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: source }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to load image (${response.status}): ${errorText}`);
      }
      return (await response.json()) as ImageMetadataResponse;
    } else {
      const formData = new FormData();
      formData.append('file', source);
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to load image file (${response.status}): ${errorText}`);
      }
      return (await response.json()) as ImageMetadataResponse;
    }
  }

  /**
   * Returns the URL for preview JPEG stream.
   */
  public getPreviewUrl(): string {
    return `${this.baseUrl}/api/image/preview`;
  }

  /**
   * Sample pixel coordinate on the active preview image.
   */
  public async sampleColor(x: number, y: number, name?: string): Promise<ColorSample> {
    const payload: SampleColorRequest = { x, y, name };
    const response = await fetch(`${this.baseUrl}/api/image/sample`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to sample color at (${x}, ${y}): ${errorText}`);
    }
    return (await response.json()) as ColorSample;
  }

  /**
   * Evaluate active color samples against registered photographic harmonies.
   */
  public async analyzeHarmonies(
    samples: ColorSample[],
    keyHueOverride?: number | null
  ): Promise<HarmonyAnalyzeResponse> {
    const payload: HarmonyAnalyzeRequest = {
      samples,
      key_hue_override: keyHueOverride ?? null,
    };
    const response = await fetch(`${this.baseUrl}/api/harmony/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Harmony analysis failed (${response.status}): ${errorText}`);
    }
    return (await response.json()) as HarmonyAnalyzeResponse;
  }

  /**
   * Export adjustments or directives to Adobe Camera Raw .xmp sidecar.
   */
  public async exportXmp(
    photoPath: string,
    directives?: SpokeDirective[],
    adjustments?: Record<string, unknown>
  ): Promise<ExportXmpResponse> {
    const payload: ExportXmpRequest = {
      photo_path: photoPath,
      directives,
      adjustments,
    };
    const response = await fetch(`${this.baseUrl}/api/export/xmp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to export XMP (${response.status}): ${errorText}`);
    }
    return (await response.json()) as ExportXmpResponse;
  }

  /**
   * Connect to WebSocket /ws/live IPC channel.
   */
  public createLiveClient(
    onMessage: (msg: WebSocketIPCMessage) => void,
    onStatusChange?: (status: 'connecting' | 'open' | 'closed' | 'error') => void
  ): LiveWebSocketClient {
    return new LiveWebSocketClient(this.wsUrl, onMessage, onStatusChange);
  }
}

// Default singleton instance
export const apiClient = new ApiClient();
