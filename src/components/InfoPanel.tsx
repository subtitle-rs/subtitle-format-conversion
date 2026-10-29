import { useTranslation } from "react-i18next";
import { Info as InfoIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InfoState } from "@/hooks/useInfo";

/** 毫秒 → HH:MM:SS.mmm */
function fmtMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const millis = ms % 1000;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(millis, 3)}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

export function InfoPanel({ state }: { state: InfoState }) {
  const { t } = useTranslation();

  if (state.status === "idle") {
    return (
      <Card className="flex h-full items-center justify-center">
        <CardContent className="text-sm text-muted-foreground">
          {t("tool.info.placeholder")}
        </CardContent>
      </Card>
    );
  }

  if (state.status === "error") {
    return (
      <Card className="flex h-full items-center justify-center">
        <CardContent className="text-sm text-destructive">
          {t("tool.info.failed")} {state.message}
        </CardContent>
      </Card>
    );
  }

  const { format, count, total_duration_ms, first_timestamp, last_timestamp } = state.data;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <InfoIcon className="h-5 w-5" />
          {t("tool.info.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="mx-auto max-w-md">
          <Row label={t("tool.info.row_format")} value={t(`format.${format}`)} />
          <Row label={t("tool.info.row_count")} value={String(count)} />
          <Row label={t("tool.info.row_duration")} value={fmtMs(total_duration_ms)} />
          <Row label={t("tool.info.row_first")} value={fmtMs(first_timestamp)} />
          <Row label={t("tool.info.row_last")} value={fmtMs(last_timestamp)} />
        </div>
      </CardContent>
    </Card>
  );
}
