export const FORMAT_EXTENSIONS: Record<string, string> = {
  srt: "srt",
  vtt: "vtt",
  ass: "ass",
  ssa: "ssa",
  microdvd: "sub",
  spruce: "spruce",
  subviewer: "sub",
  ttml: "ttml",
  dfxp: "dfxp",
  itt: "itt",
  whisper: "json",
  sbv: "sbv",
  lrc: "lrc",
  sami: "smi",
  mpl2: "mpl",
  scc: "scc",
  ebu_stl: "stl",
};

// 显示名已迁入 i18n(format.* 翻译键)
export const ALL_FORMATS = Object.keys(FORMAT_EXTENSIONS);

// 默认目标:源是 srt 则默认 vtt,反之亦然;其余默认 vtt
export function defaultTarget(source: string | null): string {
  if (source === "srt") return "vtt";
  if (source === "vtt") return "srt";
  return "vtt";
}
