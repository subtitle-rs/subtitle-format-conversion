use subtitler::model::Format;
use wasm_bindgen::prelude::*;

/// 字符串 → Format。不认识返回 None。
pub(crate) fn format_from_name(name: &str) -> Option<Format> {
    match name.to_lowercase().as_str() {
        "srt" => Some(Format::Srt),
        "vtt" => Some(Format::Vtt),
        "ass" => Some(Format::Ass),
        "ssa" => Some(Format::Ssa),
        "microdvd" => Some(Format::MicroDvd),
        "subviewer" => Some(Format::SubViewer),
        "ttml" => Some(Format::Ttml),
        "sbv" => Some(Format::Sbv),
        "lrc" => Some(Format::Lrc),
        "sami" => Some(Format::Sami),
        "mpl2" => Some(Format::Mpl2),
        "scc" => Some(Format::Scc),
        "ebu_stl" => Some(Format::EbuStl),
        _ => None,
    }
}

/// Format → 字符串。与 spec §6.3 表一致。
pub(crate) fn format_to_name(fmt: Format) -> &'static str {
    match fmt {
        Format::Srt => "srt",
        Format::Vtt => "vtt",
        Format::Ass => "ass",
        Format::Ssa => "ssa",
        Format::MicroDvd => "microdvd",
        Format::SubViewer => "subviewer",
        Format::Ttml => "ttml",
        Format::Sbv => "sbv",
        Format::Lrc => "lrc",
        Format::Sami => "sami",
        Format::Mpl2 => "mpl2",
        Format::Scc => "scc",
        Format::EbuStl => "ebu_stl",
    }
}

/// 列出所有支持的目标格式(JSON 数组字符串),前端 JSON.parse 用。
#[wasm_bindgen]
pub fn supported_formats() -> String {
    let names = [
        "srt",
        "vtt",
        "ass",
        "ssa",
        "microdvd",
        "subviewer",
        "ttml",
        "sbv",
        "lrc",
        "sami",
        "mpl2",
        "scc",
        "ebu_stl",
    ];
    serde_json::to_string(&names).expect("static array always serializes")
}

/// 检测字幕格式。返回 "srt"/"vtt"/... 或 null(检测不出)。
#[wasm_bindgen]
pub fn detect_subtitle(content: &str) -> Option<String> {
    subtitler::detect_format(content.as_bytes())
        .map(format_to_name)
        .map(str::to_string)
}

/// 转换格式。返回 JSON 字符串:
///   成功 {"ok":true,"format":"vtt","count":N,"output":"..."}
///   失败 {"ok":false,"error":"..."}
///
/// 永不 panic:全 match/Result,任何错误都走结构化返回。
#[wasm_bindgen]
pub fn convert_subtitle(content: &str, target: &str) -> String {
    use subtitler::model::SubtitleFormat as _;

    // 1. 解析目标格式
    let target_fmt = match format_from_name(target) {
        Some(f) => f,
        None => {
            return serde_json::json!({
                "ok": false,
                "error": format!("Unsupported target format: {}", target)
            })
            .to_string();
        }
    };

    // 2. 解析源内容
    let file = match subtitler::parse_bytes(content.as_bytes()) {
        Ok(f) => f,
        Err(e) => {
            return serde_json::json!({
                "ok": false,
                "error": e.to_string()
            })
            .to_string();
        }
    };

    // 3. 序列化为目标格式
    let count = file.subtitles().len() as u32;
    let output = file.to_string_with_format(&target_fmt);

    serde_json::json!({
        "ok": true,
        "format": format_to_name(target_fmt),
        "count": count,
        "output": output
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use wasm_bindgen_test::*;

    #[wasm_bindgen_test]
    fn parse_format_name_srt() {
        assert!(format_from_name("srt").is_some());
    }

    #[wasm_bindgen_test]
    fn parse_format_name_unknown_returns_none() {
        assert!(format_from_name("garbage").is_none());
    }

    #[wasm_bindgen_test]
    fn format_name_roundtrip() {
        let fmt = format_from_name("vtt").unwrap();
        assert_eq!(format_to_name(fmt), "vtt");
    }

    #[wasm_bindgen_test]
    fn supported_formats_contains_core() {
        let list = supported_formats();
        assert!(list.contains("srt"));
        assert!(list.contains("vtt"));
        assert!(list.contains("ass"));
    }

    #[wasm_bindgen_test]
    fn detect_srt_content() {
        let srt = "1\n00:00:01,000 --> 00:00:03,500\nHello\n\n";
        assert_eq!(detect_subtitle(srt), Some("srt".to_string()));
    }

    #[wasm_bindgen_test]
    fn detect_garbage_returns_none() {
        assert_eq!(detect_subtitle("this is not a subtitle"), None);
    }

    #[wasm_bindgen_test]
    fn convert_srt_to_vtt() {
        let srt = "1\n00:00:01,000 --> 00:00:03,500\nHello\n\n";
        let resp = convert_subtitle(srt, "vtt");
        let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
        assert_eq!(v["ok"], true);
        assert_eq!(v["format"], "vtt");
        assert_eq!(v["count"], 1);
        assert!(v["output"].as_str().unwrap().contains("WEBVTT"));
    }

    #[wasm_bindgen_test]
    fn convert_unknown_target_returns_error() {
        let srt = "1\n00:00:01,000 --> 00:00:03,500\nHello\n\n";
        let resp = convert_subtitle(srt, "zzz");
        let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
        assert_eq!(v["ok"], false);
        assert!(v["error"].as_str().unwrap().contains("zzz"));
    }

    #[wasm_bindgen_test]
    fn convert_invalid_content_returns_error() {
        let resp = convert_subtitle("not a subtitle at all", "vtt");
        let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
        assert_eq!(v["ok"], false);
    }
}
