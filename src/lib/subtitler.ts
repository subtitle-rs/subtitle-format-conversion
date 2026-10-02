import init, {
  detect_subtitle,
  convert_subtitle,
  supported_formats,
  get_info_subtitle,
  validate_subtitle,
  normalize_subtitle,
  repair_subtitle,
  parse_edl_cuts,
} from "@wasm/subtitle_converter_wasm";

export type SubtitleFormat = string;

export type ConvertResponse =
  | { ok: true; format: SubtitleFormat; count: number; output: string }
  | { ok: false; error: string };

let initPromise: Promise<unknown> | null = null;

/** 懒加载初始化 wasm(幂等) */
export async function ensureWasm(): Promise<void> {
  if (!initPromise) {
    initPromise = init();
  }
  await initPromise;
}

export function detect(content: string): string | null {
  return detect_subtitle(content) ?? null;
}

export function convert(content: string, target: SubtitleFormat): ConvertResponse {
  const raw = convert_subtitle(content, target);
  return JSON.parse(raw) as ConvertResponse;
}

export function listFormats(): string[] {
  try {
    return JSON.parse(supported_formats()) as string[];
  } catch {
    return [];
  }
}

export type InfoResponse =
  | {
      ok: true;
      format: SubtitleFormat;
      count: number;
      total_duration_ms: number;
      first_timestamp: number;
      last_timestamp: number;
    }
  | { ok: false; error: string };

export type ValidateResponse =
  | {
      ok: true;
      format: SubtitleFormat;
      count: number;
      issue_count: number;
      issues: string[];
    }
  | { ok: false; error: string };

export type NormalizeResponse =
  | { ok: true; output: string }
  | { ok: false; error: string };

export function getInfo(content: string): InfoResponse {
  const raw = get_info_subtitle(content);
  return JSON.parse(raw) as InfoResponse;
}

export type GuidelinePreset = "basic" | "netflix" | "bbc" | "ted" | "ard" | "channel4";

export function validate(
  content: string,
  guideline: GuidelinePreset = "basic"
): ValidateResponse {
  const raw = validate_subtitle(content, guideline);
  return JSON.parse(raw) as ValidateResponse;
}

export type RepairResponse =
  | { ok: true; output: string; before: number; after: number }
  | { ok: false; error: string };

export type EdlCutsResponse =
  | { ok: true; cuts: number[] }
  | { ok: false; error: string };

export function repair(
  content: string,
  opts: {
    minGapMs: number; // -1 = off
    mergeGapMs: number; // -1 = off
    rollup: boolean;
    cutsMs: number[];
    beforeFrames: number;
    afterFrames: number;
    fps: number;
  }
): RepairResponse {
  const raw = repair_subtitle(
    content,
    opts.minGapMs,
    opts.mergeGapMs,
    opts.rollup,
    opts.cutsMs,
    opts.beforeFrames,
    opts.afterFrames,
    opts.fps
  );
  return JSON.parse(raw) as RepairResponse;
}

export function parseEdlCuts(edl: string, fps: number): EdlCutsResponse {
  const raw = parse_edl_cuts(edl, fps);
  return JSON.parse(raw) as EdlCutsResponse;
}

export function normalize(content: string): NormalizeResponse {
  const raw = normalize_subtitle(content);
  return JSON.parse(raw) as NormalizeResponse;
}
