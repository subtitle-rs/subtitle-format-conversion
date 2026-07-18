import { useState } from "react";
import { Check, Copy, Download, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { FORMAT_EXTENSIONS, FORMAT_LABELS } from "@/lib/formats";
import type { ConvertResult } from "@/hooks/useSubtitleConvert";
import type { SubtitleFormat } from "@/lib/subtitler";

interface Props {
  result: ConvertResult;
  target: SubtitleFormat;
  fileName: string | null;
}

export function OutputPanel({ result, target, fileName }: Props) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    if (result.status !== "ok") return;
    await navigator.clipboard.writeText(result.output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const onDownload = () => {
    if (result.status !== "ok") return;
    const base = fileName?.replace(/\.[^.]+$/, "") ?? "subtitle";
    const ext = FORMAT_EXTENSIONS[target] ?? target;
    const blob = new Blob([result.output], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">
          转换结果 · {FORMAT_LABELS[target] ?? target}
        </CardTitle>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onCopy}
            disabled={result.status !== "ok"}
          >
            {copied ? (
              <Check className="mr-1 h-3.5 w-3.5" />
            ) : (
              <Copy className="mr-1 h-3.5 w-3.5" />
            )}
            {copied ? "已复制" : "复制"}
          </Button>
          <Button size="sm" onClick={onDownload} disabled={result.status !== "ok"}>
            <Download className="mr-1 h-3.5 w-3.5" /> 下载
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {result.status === "idle" && (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            输入字幕内容后,转换结果将显示在此
          </div>
        )}
        {result.status === "error" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-destructive">
            <AlertCircle className="h-8 w-8" />
            <p>转换失败</p>
            <pre className="max-w-full overflow-auto rounded bg-destructive/10 p-3 text-xs text-destructive">
              {result.message}
            </pre>
          </div>
        )}
        {result.status === "ok" && (
          <>
            <div className="mb-2 flex gap-2">
              <Badge variant="secondary" className="text-xs">
                {result.count} 条字幕
              </Badge>
              <Badge variant="outline" className="text-xs">
                {(new Blob([result.output]).size / 1024).toFixed(1)} KB
              </Badge>
            </div>
            <ScrollArea className="flex-1 rounded-md border">
              <pre className="p-3 font-mono text-xs leading-relaxed">{result.output}</pre>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  );
}
