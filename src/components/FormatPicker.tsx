import { ArrowRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_FORMATS, FORMAT_LABELS } from "@/lib/formats";
import type { SubtitleFormat } from "@/lib/subtitler";

interface Props {
  sourceFormat: SubtitleFormat | null; // null = 未检测/检测失败
  detectError: boolean;
  manualSource: SubtitleFormat | null; // 用户手动指定的源
  target: SubtitleFormat;
  onManualSource: (f: SubtitleFormat) => void;
  onTarget: (f: SubtitleFormat) => void;
}

export function FormatPicker({
  sourceFormat,
  detectError,
  manualSource,
  target,
  onManualSource,
  onTarget,
}: Props) {
  const displaySource = manualSource ?? sourceFormat;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-6 py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">源格式</span>
        {detectError && !manualSource ? (
          <Select onValueChange={onManualSource} value={manualSource ?? ""}>
            <SelectTrigger className="w-[200px] border-destructive">
              <SelectValue placeholder="无法识别,请选择" />
            </SelectTrigger>
            <SelectContent>
              {ALL_FORMATS.map((f) => (
                <SelectItem key={f} value={f}>
                  {FORMAT_LABELS[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="font-mono text-sm">
            {displaySource ? FORMAT_LABELS[displaySource] ?? displaySource : "—"}
          </span>
        )}
      </div>

      <ArrowRight className="h-4 w-4 text-muted-foreground" />

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">目标格式</span>
        <Select value={target} onValueChange={onTarget}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALL_FORMATS.map((f) => (
              <SelectItem key={f} value={f}>
                {FORMAT_LABELS[f]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
