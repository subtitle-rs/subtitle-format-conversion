import { useValidate } from "@/hooks/useValidate";
import { ValidatePanel } from "@/components/ValidatePanel";

interface Props {
  raw: string;
  active: boolean;
}

export function ValidateTool({ raw, active }: Props) {
  const state = useValidate(raw, active);
  return <ValidatePanel state={state} />;
}
