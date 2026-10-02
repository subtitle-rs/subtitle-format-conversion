import { useEffect, useRef, useState } from "react";
import { validate, type GuidelinePreset, type ValidateResponse } from "@/lib/subtitler";

export type ValidateState =
  | { status: "idle" }
  | { status: "ok"; data: Extract<ValidateResponse, { ok: true }> }
  | { status: "error"; message: string };

export function useValidate(raw: string, active: boolean, preset: GuidelinePreset) {
  const [state, setState] = useState<ValidateState>({ status: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!active) return; // 懒计算守卫
    if (!raw.trim()) {
      setState({ status: "idle" });
      return;
    }
    timer.current = setTimeout(() => {
      const resp = validate(raw, preset);
      setState(
        resp.ok
          ? { status: "ok", data: resp }
          : { status: "error", message: resp.error }
      );
    }, 150);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [raw, active, preset]);

  return state;
}
