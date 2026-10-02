import { useRef, useState } from "react";
import { Check, Copy, Download, Wrench, FileUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseEdlCuts, type EdlCutsResponse } from "@/lib/subtitler";
import { useRepair, type RepairOptions } from "@/hooks/useRepair";

interface Props {
  raw: string;
  state: ReturnType<typeof useRepair>["state"];
  options: RepairOptions;
  onOptionsChange: (o: RepairOptions) => void;
  onRun: () => void;
  fileName: string | null;
}

const FPS_OPTIONS = [23.976, 24, 25, 29.97, 30];

export function RepairPanel({ raw, state, options, onOptionsChange, onRun, fileName }: Props) {
  const [copied, setCopied] = useState(false);
  const [edlName, setEdlName] = useState<string | null>(null);
  const [edlError, setEdlError] = useState<string | null>(null);
  const edlRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof RepairOptions>(k: K, v: RepairOptions[K]) =>
    onOptionsChange({ ...options, [k]: v });

  const onEdlFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const resp: EdlCutsResponse = parseEdlCuts(reader.result as string, options.fps);
      if (resp.ok) {
        set("cutsMs", resp.cuts);
        setEdlName(`${file.name} · ${resp.cuts.length} 个切镜点`);
        setEdlError(null);
      } else {
        set("cutsMs", []);
        setEdlName(null);
        setEdlError(resp.error);
      }
    };
    reader.readAsText(file);
  };

  const onCopy = async () => {
    if (state.status !== "ok") return;
    await navigator.clipboard.writeText(state.output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const onDownload = () => {
    if (state.status !== "ok") return;
    const blob = new Blob([state.output], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(fileName ?? "subtitle").replace(/\.[^.]+$/, "")}.repaired`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const canRun = raw.trim().length > 0;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench className="h-5 w-5" />
          字幕修复
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {/* 修复操作 */}
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={options.minGapEnabled}
              onCheckedChange={(c) => set("minGapEnabled", c === true)}
            />
            保证最小间隔
            <Input
              type="number"
              value={options.minGapMs}
              onChange={(e) => set("minGapMs", Number(e.target.value) || 0)}
              disabled={!options.minGapEnabled}
              className="ml-auto h-7 w-24"
            />
            <span className="text-xs text-muted-foreground">ms</span>
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={options.mergeEnabled}
              onCheckedChange={(c) => set("mergeEnabled", c === true)}
            />
            合并重复文本 gap ≤
            <Input
              type="number"
              value={options.mergeGapMs}
              onChange={(e) => set("mergeGapMs", Number(e.target.value) || 0)}
              disabled={!options.mergeEnabled}
              className="h-7 w-24"
            />
            <span className="text-xs text-muted-foreground">ms</span>
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={options.rollup}
              onCheckedChange={(c) => set("rollup", c === true)}
            />
            Roll-up 修复(合并相邻相同文本)
          </label>
        </div>

        {/* EDL 镜头切换 */}
        <div className="rounded-md border p-3">
          <p className="mb-2 text-sm font-medium">镜头切换规则(Netflix 出海)</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Button variant="outline" size="sm" onClick={() => edlRef.current?.click()}>
              <FileUp className="mr-1 h-3.5 w-3.5" /> 选择 EDL
            </Button>
            {edlName && <span className="text-xs text-muted-foreground">{edlName}</span>}
            {edlError && (
              <span className="text-xs text-destructive">EDL 解析失败:{edlError}</span>
            )}
            <input
              ref={edlRef}
              type="file"
              accept=".edl,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onEdlFile(f);
              }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">帧率</span>
            <Select value={String(options.fps)} onValueChange={(v) => set("fps", Number(v))}>
              <SelectTrigger className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FPS_OPTIONS.map((f) => (
                  <SelectItem key={f} value={String(f)}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="ml-2 text-muted-foreground">切前留</span>
            <Input
              type="number"
              value={options.beforeFrames}
              onChange={(e) => set("beforeFrames", Number(e.target.value) || 0)}
              className="h-7 w-16"
            />
            <span className="text-muted-foreground">帧 · 切后留</span>
            <Input
              type="number"
              value={options.afterFrames}
              onChange={(e) => set("afterFrames", Number(e.target.value) || 0)}
              className="h-7 w-16"
            />
            <span className="text-muted-foreground">帧</span>
          </div>
        </div>

        <Button onClick={onRun} disabled={!canRun} size="sm" className="w-fit">
          <Wrench className="mr-1 h-3.5 w-3.5" /> 执行修复
        </Button>

        {/* 结果区 */}
        {state.status === "idle" && (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            勾选修复项后点击「执行修复」
          </div>
        )}
        {state.status === "error" && (
          <div className="flex flex-1 items-center justify-center text-sm text-destructive">
            修复失败:{state.message}
          </div>
        )}
        {state.status === "ok" && (
          <>
            <div className="flex items-center gap-3 text-sm">
              <Button size="sm" variant="outline" onClick={onCopy}>
                {copied ? (
                  <Check className="mr-1 h-3.5 w-3.5" />
                ) : (
                  <Copy className="mr-1 h-3.5 w-3.5" />
                )}
                {copied ? "已复制" : "复制"}
              </Button>
              <Button size="sm" onClick={onDownload}>
                <Download className="mr-1 h-3.5 w-3.5" /> 下载
              </Button>
              <span className="text-muted-foreground">
                字幕 {state.before} 条 → {state.after} 条
              </span>
            </div>
            <ScrollArea className="flex-1 rounded-md border">
              <pre className="p-3 font-mono text-xs leading-relaxed">{state.output}</pre>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  );
}
