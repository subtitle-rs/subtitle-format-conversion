import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { ALL_FORMATS } from "@/lib/formats";

export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="border-t px-6 py-4 text-sm text-muted-foreground">
      <p className="mb-2">{t("footer.supported")}</p>
      <div className="flex flex-wrap gap-1.5">
        {ALL_FORMATS.map((f) => (
          <Badge key={f} variant="outline" className="font-mono text-xs">
            {t(`format.${f}`)}
          </Badge>
        ))}
      </div>
      <p className="mt-3 text-xs">
        {t("footer.based_on_prefix")}{" "}
        <a
          className="underline"
          href="https://crates.io/crates/subtitler"
          target="_blank"
          rel="noreferrer"
        >
          subtitler
        </a>{" "}
        {t("footer.based_on_suffix")}
      </p>
    </footer>
  );
}
