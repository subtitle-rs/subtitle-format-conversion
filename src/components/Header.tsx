import { ExternalLink, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Header() {
  return (
    <header className="flex items-center justify-between border-b px-6 py-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">字幕格式转换</h1>
        <Badge variant="secondary" className="font-mono text-xs">
          Subtitle Converter
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="gap-1">
              <Lock className="h-3 w-3" /> 纯本地处理
            </Badge>
          </TooltipTrigger>
          <TooltipContent>文件不离开你的浏览器,无需上传</TooltipContent>
        </Tooltip>
        <ThemeToggle />
        <Button variant="ghost" size="icon" asChild>
          <a
            href="https://github.com/subtitle-rs/subtitler"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </div>
    </header>
  );
}
