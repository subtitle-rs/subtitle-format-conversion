import { ExternalLink, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export function Header() {
  const { t } = useTranslation();

  return (
    <header className="flex items-center justify-between border-b px-6 py-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">{t("app.name")}</h1>
        <Badge variant="secondary" className="font-mono text-xs">
          Subtitle Workbench
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="gap-1">
              <Lock className="h-3 w-3" /> {t("common.local_badge")}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{t("common.local_tooltip")}</TooltipContent>
        </Tooltip>
        <LanguageSwitcher />
        <ThemeToggle />
        <Button variant="ghost" size="icon" asChild>
          <a
            href="https://github.com/subtitle-rs/subtitler"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </div>
    </header>
  );
}
