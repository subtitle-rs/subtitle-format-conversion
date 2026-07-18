import init, {
  detect_subtitle,
  convert_subtitle,
  supported_formats,
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
