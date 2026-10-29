import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { languageByCode } from "@/i18n/languages";

/** 把 i18n 当前语言同步到 <html lang/dir> 和 document.title。 */
export function useDocumentLang() {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const lang = i18n.language;
    const def = languageByCode(lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = def?.dir ?? "ltr";
    document.title = t("app.title");
  }, [i18n.language, t]);
}
