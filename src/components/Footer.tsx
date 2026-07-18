import { Badge } from "@/components/ui/badge";
import { ALL_FORMATS, FORMAT_LABELS } from "@/lib/formats";

export function Footer() {
  return (
    <footer className="border-t px-6 py-4 text-sm text-muted-foreground">
      <p className="mb-2">支持的字幕格式:</p>
      <div className="flex flex-wrap gap-1.5">
        {ALL_FORMATS.map((f) => (
          <Badge key={f} variant="outline" className="font-mono text-xs">
            {FORMAT_LABELS[f] ?? f}
          </Badge>
        ))}
      </div>
      <p className="mt-3 text-xs">
        基于{" "}
        <a
          className="underline"
          href="https://crates.io/crates/subtitler"
          target="_blank"
          rel="noreferrer"
        >
          subtitler
        </a>{" "}
        Rust 库 · 编译为 WebAssembly · 100% 浏览器内运行
      </p>
    </footer>
  );
}
