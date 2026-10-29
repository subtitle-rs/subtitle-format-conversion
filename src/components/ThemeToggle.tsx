import { Moon, Sun, Monitor } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme, type Theme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Theme; icon: typeof Sun; key: string }[] = [
  { value: "light", icon: Sun, key: "theme.light" },
  { value: "dark", icon: Moon, key: "theme.dark" },
  { value: "system", icon: Monitor, key: "theme.system" },
];

export function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title={t("theme.toggle_title")}>
          {resolvedTheme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map(({ value, icon: Icon, key }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className={cn(theme === value && "font-semibold")}
          >
            <Icon className="mr-2 h-4 w-4" />
            {t(key)}
            {theme === value && <span className="ml-auto text-xs">●</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
