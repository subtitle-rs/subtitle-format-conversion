import { useCallback, useState } from "react";
import { repair } from "@/lib/subtitler";

export type RepairState =
  | { status: "idle" }
  | { status: "ok"; output: string; before: number; after: number }
  | { status: "error"; message: string };

export interface RepairOptions {
  minGapEnabled: boolean;
  minGapMs: number;
  mergeEnabled: boolean;
  mergeGapMs: number;
  rollup: boolean;
  cutsMs: number[];
  beforeFrames: number;
  afterFrames: number;
  fps: number;
}

export const DEFAULT_REPAIR_OPTIONS: RepairOptions = {
  minGapEnabled: true,
  minGapMs: 500,
  mergeEnabled: true,
  mergeGapMs: 2000,
  rollup: false,
  cutsMs: [],
  beforeFrames: 2,
  afterFrames: 12,
  fps: 25,
};

/** 修复 hook —— 按钮触发,不自动 debounce(破坏性操作,同规范化模式)。 */
export function useRepair(raw: string) {
  const [state, setState] = useState<RepairState>({ status: "idle" });
  const [options, setOptions] = useState<RepairOptions>(DEFAULT_REPAIR_OPTIONS);

  const run = useCallback(() => {
    if (!raw.trim()) {
      setState({ status: "idle" });
      return;
    }
    const resp = repair(raw, {
      minGapMs: options.minGapEnabled ? options.minGapMs : -1,
      mergeGapMs: options.mergeEnabled ? options.mergeGapMs : -1,
      rollup: options.rollup,
      cutsMs: options.cutsMs,
      beforeFrames: options.beforeFrames,
      afterFrames: options.afterFrames,
      fps: options.fps,
    });
    setState(
      resp.ok
        ? { status: "ok", output: resp.output, before: resp.before, after: resp.after }
        : { status: "error", message: resp.error }
    );
  }, [raw, options]);

  return { state, options, setOptions, run };
}
