export const FORMAT_EXTENSIONS: Record<string, string> = {
  srt: "srt",
  vtt: "vtt",
  ass: "ass",
  ssa: "ssa",
  microdvd: "sub",
  subviewer: "sub",
  ttml: "ttml",
  sbv: "sbv",
  lrc: "lrc",
  sami: "smi",
  mpl2: "mpl",
  scc: "scc",
  ebu_stl: "stl",
};

export const FORMAT_LABELS: Record<string, string> = {
  srt: "SubRip (SRT)",
  vtt: "WebVTT (VTT)",
  ass: "Advanced SubStation (ASS)",
  ssa: "SubStation Alpha (SSA)",
  microdvd: "MicroDVD",
  subviewer: "SubViewer",
  ttml: "TTML / IMSC",
  sbv: "YouTube SBV",
  lrc: "LRC 歌词",
  sami: "SAMI",
  mpl2: "MPL2",
  scc: "SCC (广播)",
  ebu_stl: "EBU STL (广播)",
};

// 与 wasm supported_formats() 一致;硬编码作 fallback,wasm 加载后会被覆盖
export const ALL_FORMATS = Object.keys(FORMAT_EXTENSIONS);

// 默认目标:源是 srt 则默认 vtt,反之亦然;其余默认 vtt
export function defaultTarget(source: string | null): string {
  if (source === "srt") return "vtt";
  if (source === "vtt") return "srt";
  return "vtt";
}
