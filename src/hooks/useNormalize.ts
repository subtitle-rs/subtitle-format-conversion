import { useCallback, useState } from "react";
import { normalize } from "@/lib/subtitler";

export type NormalizeState =
  | { status: "idle" }
  | { status: "ok"; output: string }
  | { status: "error"; message: string };

/**
 * 规范化 hook —— 按钮触发,不自动 debounce。
 * 返回 run() 触发规范化 + state。
 */
export function useNormalize(raw: string) {
  const [state, setState] = useState<NormalizeState>({ status: "idle" });

  const run = useCallback(() => {
    if (!raw.trim()) {
      setState({ status: "idle" });
      return;
    }
    const resp = normalize(raw);
    setState(
      resp.ok
        ? { status: "ok", output: resp.output }
        : { status: "error", message: resp.error }
    );
  }, [raw]);

  return { state, run };
}
