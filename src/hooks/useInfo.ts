import { useEffect, useRef, useState } from "react";
import { getInfo, type InfoResponse } from "@/lib/subtitler";

export type InfoState =
  | { status: "idle" }
  | { status: "ok"; data: Extract<InfoResponse, { ok: true }> }
  | { status: "error"; message: string };

export function useInfo(raw: string, active: boolean) {
  const [state, setState] = useState<InfoState>({ status: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!active) return; // 懒计算守卫
    if (!raw.trim()) {
      setState({ status: "idle" });
      return;
    }
    timer.current = setTimeout(() => {
      const resp = getInfo(raw);
      setState(
        resp.ok
          ? { status: "ok", data: resp }
          : { status: "error", message: resp.error }
      );
    }, 150);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [raw, active]);

  return state;
}
