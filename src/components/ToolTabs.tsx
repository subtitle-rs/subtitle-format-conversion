import { Repeat, ShieldCheck, Wand2, Wrench, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ToolId } from "@/types";

const TOOLS: { id: ToolId; icon: typeof Repeat; key: string }[] = [
  { id: "convert", icon: Repeat, key: "nav.convert" },
  { id: "validate", icon: ShieldCheck, key: "nav.validate" },
  { id: "normalize", icon: Wand2, key: "nav.normalize" },
  { id: "repair", icon: Wrench, key: "nav.repair" },
  { id: "info", icon: Info, key: "nav.info" },
];

interface Props {
  active: ToolId;
  onChange: (id: ToolId) => void;
}

export function ToolTabs({ active, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <Tabs value={active} onValueChange={(v) => onChange(v as ToolId)}>
      <TabsList className="m-4 mb-0 flex w-fit">
        {TOOLS.map(({ id, icon: Icon, key }) => (
          <TabsTrigger key={id} value={id} className="gap-1.5">
            <Icon className="h-3.5 w-3.5" />
            {t(key)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
