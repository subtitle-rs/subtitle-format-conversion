import { useNormalize } from "@/hooks/useNormalize";
import { NormalizePanel } from "@/components/NormalizePanel";

interface Props {
  raw: string;
}

export function NormalizeTool({ raw }: Props) {
  const { state, run } = useNormalize(raw);
  return <NormalizePanel state={state} onRun={run} />;
}
