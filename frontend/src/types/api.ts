import { HSLColor, RGBColor } from './color';

export interface ColorSample {
  id: string;
  name: string;
  x: number;
  y: number;
  rgb: RGBColor;
  hsl: HSLColor;
}

export interface ImageMetadataResponse {
  file_path: string;
  preview_url: string;
  width: number;
  height: number;
  format: string;
  is_embedded_preview: boolean;
  extraction_time_ms: number;
}

export interface SampleColorRequest {
  x: number;
  y: number;
  name?: string;
}

export interface SpokeDirective {
  sample_id: string;
  sample_name: string;
  current_hue: number;
  target_hue: number;
  delta_degrees: number;
  target_color_name: string;
  instruction: string;
}

export interface HarmonyEvaluationResult {
  harmony_name: string;
  match_score: number;
  spoke_angles: number[];
  directives: SpokeDirective[];
  metadata?: Record<string, unknown>;
}

export interface HarmonyAnalyzeRequest {
  samples: ColorSample[];
  key_hue_override?: number | null;
}

export interface HarmonyAnalyzeResponse {
  plugin: string;
  sample_count: number;
  harmonies: HarmonyEvaluationResult[];
  top_harmony?: HarmonyEvaluationResult | null;
}

export interface ExportXmpRequest {
  photo_path: string;
  directives?: SpokeDirective[];
  adjustments?: Record<string, unknown>;
}

export interface ExportXmpResponse {
  photo_path: string;
  xmp_path: string;
  success: boolean;
  adjustments_applied: Record<string, unknown>;
}

export type WebSocketIPCMessage =
  | { type: 'connected'; message: string }
  | { type: 'image_loaded'; data: ImageMetadataResponse }
  | { type: 'color_sampled'; data: ColorSample }
  | { type: 'harmony_analyzed'; data: HarmonyAnalyzeResponse }
  | { type: 'xmp_exported'; data: ExportXmpResponse }
  | { type: 'pong' }
  | { type: 'echo'; payload?: unknown }
  | { type: 'ack'; received_type: string; data?: unknown }
  | { type: string; [key: string]: unknown };
