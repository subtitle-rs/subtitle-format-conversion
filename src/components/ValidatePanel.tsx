import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FORMAT_LABELS } from "@/lib/formats";
import type { GuidelinePreset } from "@/lib/subtitler";
import type { ValidateState } from "@/hooks/useValidate";

const PRESETS: { value: GuidelinePreset; label: string }[] = [
  { value: "basic", label: "基础" },
  { value: "netflix", label: "Netflix 出海规范" },
  { value: "bbc", label: "BBC" },
  { value: "ted", label: "TED" },
  { value: "ard", label: "ARD/ORF/SRF/ZDF" },
  { value: "channel4", label: "Channel 4" },
];

interface Props {
  state: ValidateState;
  preset: GuidelinePreset;
  onPresetChange: (p: GuidelinePreset) => void;
}

export function ValidatePanel({ state, preset, onPresetChange }: Props) {
  if (state.status === "idle") {
    return (
      <Card className="flex h-full items-center justify-center">
        <CardContent className="text-sm text-muted-foreground">
          输入字幕后,质量校验结果将显示在此
        </CardContent>
      </Card>
    );
  }

  if (state.status === "error") {
    return (
      <Card className="flex h-full items-center justify-center">
        <CardContent className="text-center text-sm text-destructive">
          <XCircle className="mx-auto mb-2 h-8 w-8" />
          <p>校验失败</p>
          <pre className="mt-2 max-w-full overflow-auto rounded bg-destructive/10 p-2 text-xs">
            {state.message}
          </pre>
        </CardContent>
      </Card>
    );
  }

  const { format, count, issue_count, issues } = state.data;
  const clean = issue_count === 0;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={preset} onValueChange={(v) => onPresetChange(v as GuidelinePreset)}>
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <CardTitle className="mt-2 flex flex-wrap items-center gap-2 text-base">
          {clean ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
          )}
          {FORMAT_LABELS[format] ?? format}
          <Badge variant="secondary">{count} 条字幕</Badge>
          <Badge variant={clean ? "secondary" : "destructive"}>
            {issue_count} 个问题
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        {clean ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <CheckCircle2 className="mr-2 h-5 w-5 text-green-500" />
            未发现问题
          </div>
        ) : (
          <ScrollArea className="h-full rounded-md border">
            <ul className="p-3 text-sm">
              {issues.map((issue, i) => (
                <li key={i} className="flex gap-2 py-1 font-mono text-xs">
                  <span className="text-yellow-500">•</span>
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
