import { Repeat, ShieldCheck, Wand2, Wrench, Info } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ToolId } from "@/types";

const TOOLS: { id: ToolId; label: string; icon: typeof Repeat }[] = [
  { id: "convert", label: "格式转换", icon: Repeat },
  { id: "validate", label: "质量校验", icon: ShieldCheck },
  { id: "normalize", label: "文本规范化", icon: Wand2 },
  { id: "repair", label: "修复", icon: Wrench },
  { id: "info", label: "字幕信息", icon: Info },
];

interface Props {
  active: ToolId;
  onChange: (id: ToolId) => void;
}

export function ToolTabs({ active, onChange }: Props) {
  return (
    <Tabs value={active} onValueChange={(v) => onChange(v as ToolId)}>
      <TabsList className="m-4 mb-0 flex w-fit">
        {TOOLS.map(({ id, label, icon: Icon }) => (
          <TabsTrigger key={id} value={id} className="gap-1.5">
            <Icon className="h-3.5 w-3.5" />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
