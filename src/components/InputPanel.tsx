import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Upload, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onFileLoaded?: (fileName: string) => void;
}

export function InputPanel({ value, onChange, onFileLoaded }: Props) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const readFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        onChange(reader.result as string);
        onFileLoaded?.(file.name);
      };
      reader.readAsText(file);
    },
    [onChange, onFileLoaded]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) readFile(file);
    },
    [readFile]
  );

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("tool.input.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <Tabs defaultValue="upload" className="flex flex-1 flex-col">
          <TabsList>
            <TabsTrigger value="upload" className="gap-1.5">
              <Upload className="h-3.5 w-3.5" /> {t("tool.input.tab_upload")}
            </TabsTrigger>
            <TabsTrigger value="paste" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" /> {t("tool.input.tab_paste")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="flex-1">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "flex h-full min-h-[300px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:bg-muted/30",
                dragging && "border-primary bg-primary/5 text-primary"
              )}
            >
              <Upload className="h-8 w-8" />
              <p className="text-sm">{t("tool.input.drop_hint")}</p>
              <p className="text-xs text-muted-foreground/70">{t("tool.input.drop_formats")}</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".srt,.vtt,.ass,.ssa,.sub,.ttml,.xml,.sbv,.lrc,.smi,.sami,.mpl,.scc,.stl,.spruce,.itt,.dfxp,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readFile(f);
              }}
            />
          </TabsContent>

          <TabsContent value="paste" className="flex-1">
            {/* dir="auto":字幕内容按自身首字符定方向,不随 UI 语言(RTL)翻转 */}
            <Textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={t("tool.input.paste_placeholder")}
              dir="auto"
              className="h-full min-h-[300px] font-mono text-xs"
            />
          </TabsContent>
        </Tabs>

        {value && (
          <p className="text-xs text-muted-foreground">
            {t("common.char_count", { count: value.length })}
            {value.length > 5_000_000 && (
              <span className="ml-2 text-destructive">· {t("common.large_file_warn")}</span>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
