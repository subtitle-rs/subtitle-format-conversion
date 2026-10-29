/**
 * 语言注册表 —— 新增语言的唯一入口之一。
 *
 * 加一种语言的完整步骤:
 *   1. 在 src/i18n/locales/ 放一个 {code}.json(与 en.json 同构)
 *   2. 在 SUPPORTED_LANGUAGES 加一行 { code, nativeName, dir }
 *
 * nativeName 用该语言的原生写法(国际惯例,不随 UI 语言变化)。
 * dir 驱动 <html dir>,是 RTL 的唯一事实来源。
 */
export interface LanguageDef {
  code: string;
  nativeName: string;
  dir: "ltr" | "rtl";
}

export const SUPPORTED_LANGUAGES: LanguageDef[] = [
  { code: "en", nativeName: "English", dir: "ltr" },
  { code: "zh-CN", nativeName: "简体中文", dir: "ltr" },
  { code: "zh-TW", nativeName: "繁體中文", dir: "ltr" },
  { code: "ja", nativeName: "日本語", dir: "ltr" },
  { code: "ko", nativeName: "한국어", dir: "ltr" },
  { code: "ru", nativeName: "Русский", dir: "ltr" },
  { code: "fr", nativeName: "Français", dir: "ltr" },
  { code: "de", nativeName: "Deutsch", dir: "ltr" },
  { code: "es", nativeName: "Español", dir: "ltr" },
  { code: "pt", nativeName: "Português", dir: "ltr" },
  { code: "it", nativeName: "Italiano", dir: "ltr" },
  { code: "vi", nativeName: "Tiếng Việt", dir: "ltr" },
  { code: "ar", nativeName: "العربية", dir: "rtl" },
  { code: "he", nativeName: "עברית", dir: "rtl" },
];

export function languageByCode(code: string): LanguageDef | undefined {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code);
}
