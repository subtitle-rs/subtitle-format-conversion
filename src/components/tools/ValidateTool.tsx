import { useState } from "react";
import { useValidate } from "@/hooks/useValidate";
import { ValidatePanel } from "@/components/ValidatePanel";
import type { GuidelinePreset } from "@/lib/subtitler";

interface Props {
  raw: string;
  active: boolean;
}

export function ValidateTool({ raw, active }: Props) {
  const [preset, setPreset] = useState<GuidelinePreset>("basic");
  const state = useValidate(raw, active, preset);
  return <ValidatePanel state={state} preset={preset} onPresetChange={setPreset} />;
}
