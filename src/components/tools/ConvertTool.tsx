import { useEffect, useState } from "react";
import { defaultTarget } from "@/lib/formats";
import { useSubtitleConvert } from "@/hooks/useSubtitleConvert";
import { FormatPicker } from "@/components/FormatPicker";
import { OutputPanel } from "@/components/OutputPanel";

interface Props {
  raw: string;
  fileName: string | null;
  active: boolean;
}

export function ConvertTool({ raw, fileName, active }: Props) {
  const [manualSource, setManualSource] = useState<string | null>(null);
  const { state, setTarget, setSourceFormat } = useSubtitleConvert(raw, active);

  useEffect(() => {
    setManualSource(null);
    setTarget(defaultTarget(state.sourceFormat));
  }, [state.sourceFormat, setTarget]);

  return (
    <div className="flex flex-col gap-3 overflow-hidden">
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
      <div className="flex-1 overflow-hidden">
        <OutputPanel result={state.result} target={state.target} fileName={fileName} />
      </div>
    </div>
  );
}
