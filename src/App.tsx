import { useEffect, useState } from "react";
import { ensureWasm } from "@/lib/subtitler";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { InputPanel } from "@/components/InputPanel";
import { ToolTabs } from "@/components/ToolTabs";
import { ConvertTool } from "@/components/tools/ConvertTool";
import { ValidateTool } from "@/components/tools/ValidateTool";
import { NormalizeTool } from "@/components/tools/NormalizeTool";
import { RepairTool } from "@/components/tools/RepairTool";
import { InfoTool } from "@/components/tools/InfoTool";
import type { ToolId } from "@/types";

function Workbench() {
  const [raw, setRaw] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolId>("convert");

  return (
    <div className="flex h-screen flex-col">
      <Header />
      <ToolTabs active={activeTool} onChange={setActiveTool} />
      <main className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 md:grid-cols-2">
        <InputPanel value={raw} onChange={setRaw} onFileLoaded={setFileName} />
        {activeTool === "convert" && (
          <ConvertTool raw={raw} fileName={fileName} active={activeTool === "convert"} />
        )}
        {activeTool === "validate" && (
          <ValidateTool raw={raw} active={activeTool === "validate"} />
        )}
        {activeTool === "normalize" && <NormalizeTool raw={raw} />}
        {activeTool === "repair" && <RepairTool raw={raw} fileName={fileName} />}
        {activeTool === "info" && <InfoTool raw={raw} active={activeTool === "info"} />}
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
          <Workbench />
        )}
      </TooltipProvider>
    </ThemeProvider>
  );
}
