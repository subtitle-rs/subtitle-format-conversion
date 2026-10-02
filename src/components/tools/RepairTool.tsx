import { useRepair } from "@/hooks/useRepair";
import { RepairPanel } from "@/components/RepairPanel";

interface Props {
  raw: string;
  fileName: string | null;
}

export function RepairTool({ raw, fileName }: Props) {
  const { state, options, setOptions, run } = useRepair(raw);
  return (
    <RepairPanel
      raw={raw}
      state={state}
      options={options}
      onOptionsChange={setOptions}
      onRun={run}
      fileName={fileName}
    />
  );
}
