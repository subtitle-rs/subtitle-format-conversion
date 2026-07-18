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
}
