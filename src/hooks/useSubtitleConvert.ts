import { useCallback, useEffect, useRef, useState } from "react";
import { convert, detect, type SubtitleFormat } from "@/lib/subtitler";

export type ConvertResult =
  | { status: "idle" }
  | { status: "ok"; output: string; count: number }
  | { status: "error"; message: string };

export interface ConvertState {
  sourceFormat: SubtitleFormat | null;
  detectError: boolean; // detect 返回 null
  target: SubtitleFormat;
  result: ConvertResult;
}

/**
 * 转换 hook。raw 由外部(App)传入并共享。
 * active 控制是否计算(懒计算:非当前 Tab 时跳过)。
 */
export function useSubtitleConvert(
  raw: string,
  active: boolean,
  initialTarget: SubtitleFormat = "vtt"
) {
  const [state, setState] = useState<ConvertState>({
    sourceFormat: null,
    detectError: false,
    target: initialTarget,
    result: { status: "idle" },
  });

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setTarget = useCallback((target: SubtitleFormat) => {
    setState((s) => ({ ...s, target }));
  }, []);

  // 手动指定源格式(检测失败时的 fallback),只更新展示并清掉 detectError
  const setSourceFormat = useCallback((fmt: SubtitleFormat | null) => {
    setState((s) => ({ ...s, sourceFormat: fmt, detectError: false }));
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);

    if (!active) return; // 懒计算守卫
    if (!raw.trim()) {
      setState((s) => ({
        ...s,
        sourceFormat: null,
        detectError: false,
        result: { status: "idle" },
      }));
      return;
    }

    // debounce 150ms
    timer.current = setTimeout(() => {
      const detected = detect(raw);
      const resp = convert(raw, state.target);
      if (resp.ok) {
        setState((s) => ({
          ...s,
          sourceFormat: detected,
          detectError: detected === null,
          result: { status: "ok", output: resp.output, count: resp.count },
        }));
      } else {
        setState((s) => ({
          ...s,
          sourceFormat: detected,
          detectError: detected === null,
          result: { status: "error", message: resp.error },
        }));
      }
    }, 150);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [raw, state.target, active]);

  return { state, setTarget, setSourceFormat };
}
