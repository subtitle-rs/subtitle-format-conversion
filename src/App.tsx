import { useEffect, useState } from "react";
import { ensureWasm } from "@/lib/subtitler";
import { defaultTarget } from "@/lib/formats";
import { useSubtitleConvert } from "@/hooks/useSubtitleConvert";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { FormatPicker } from "@/components/FormatPicker";
import { InputPanel } from "@/components/InputPanel";
import { OutputPanel } from "@/components/OutputPanel";

function Converter() {
  const [manualSource, setManualSource] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const { state, setRaw, setTarget, setSourceFormat } = useSubtitleConvert();

  // 源格式变化时,清掉手动源 & 智能选默认目标
  useEffect(() => {
    setManualSource(null);
    setTarget(defaultTarget(state.sourceFormat));
  }, [state.sourceFormat, setTarget]);

  return (
    <div className="flex h-screen flex-col">
      <Header />
      <FormatPicker
        sourceFormat={state.sourceFormat}
        detectError={state.detectError}
        manualSource={manualSource}
        target={state.target}
        onManualSource={(f) => {
          setManualSource(f);
          setSourceFormat(f);
        }}
        onTarget={setTarget}
      />
      <main className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 md:grid-cols-2">
        <InputPanel value={state.raw} onChange={setRaw} onFileLoaded={setFileName} />
        <OutputPanel result={state.result} target={state.target} fileName={fileName} />
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  const [wasmReady, setWasmReady] = useState(false);
  const [wasmError, setWasmError] = useState<string | null>(null);

  useEffect(() => {
    ensureWasm()
      .then(() => setWasmReady(true))
      .catch((e) => setWasmError(String(e)));
  }, []);

  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={200}>
        {wasmError ? (
          <div className="flex h-screen flex-col items-center justify-center gap-2 text-center">
            <p className="text-destructive">引擎加载失败</p>
            <p className="text-sm text-muted-foreground">{wasmError}</p>
            <button onClick={() => location.reload()} className="text-sm underline">
              刷新重试
            </button>
          </div>
        ) : !wasmReady ? (
          <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
            正在加载字幕引擎...
          </div>
        ) : (
          <Converter />
        )}
      </TooltipProvider>
    </ThemeProvider>
  );
}
