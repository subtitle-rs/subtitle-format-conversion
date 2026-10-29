import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import ru from "./locales/ru.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import es from "./locales/es.json";
import pt from "./locales/pt.json";
import it from "./locales/it.json";
import vi from "./locales/vi.json";
import ar from "./locales/ar.json";
import he from "./locales/he.json";

// 全量静态打包;量级不大,不值得拆异步 chunk
export const resources = {
  en: { translation: en },
  "zh-CN": { translation: zhCN },
  "zh-TW": { translation: zhTW },
  ja: { translation: ja },
  ko: { translation: ko },
  ru: { translation: ru },
  fr: { translation: fr },
  de: { translation: de },
  es: { translation: es },
  pt: { translation: pt },
  it: { translation: it },
  vi: { translation: vi },
  ar: { translation: ar },
  he: { translation: he },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    // 顺序:先读用户上次的选择,再检测浏览器语言;命中失败走 fallbackLng
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "subtitle-converter-lang",
    },
    interpolation: { escapeValue: false }, // React 已防 XSS
    returnNull: false,
  });

export default i18n;
