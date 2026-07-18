import { useInfo } from "@/hooks/useInfo";
import { InfoPanel } from "@/components/InfoPanel";

interface Props {
  raw: string;
  active: boolean;
}

export function InfoTool({ raw, active }: Props) {
  const state = useInfo(raw, active);
  return <InfoPanel state={state} />;
}
