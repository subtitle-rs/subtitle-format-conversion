import { useState } from "react";
import { Check, Copy, Download, Wand2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import type { NormalizeState } from "@/hooks/useNormalize";

interface Props {
  state: NormalizeState;
  onRun: () => void;
}

export function NormalizePanel({ state, onRun }: Props) {
  const [copied, setCopied] = useState(false);

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
    a.download = "normalized.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wand2 className="h-5 w-5" />
          文本规范化
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked disabled />
            剥离 HTML/ASS 标签
          </label>
          <Button onClick={onRun} size="sm">
            <Wand2 className="mr-1 h-3.5 w-3.5" /> 规范化
          </Button>
        </div>

        {state.status === "idle" && (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            点击「规范化」处理字幕
          </div>
        )}
        {state.status === "error" && (
          <div className="flex flex-1 items-center justify-center text-sm text-destructive">
            规范化失败:{state.message}
          </div>
        )}
        {state.status === "ok" && (
          <>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={onCopy}>
                {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                {copied ? "已复制" : "复制"}
              </Button>
              <Button size="sm" onClick={onDownload}>
                <Download className="mr-1 h-3.5 w-3.5" /> 下载
              </Button>
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
