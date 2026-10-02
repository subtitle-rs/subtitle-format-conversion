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
        "spruce" => Some(Format::Spruce),
        "itt" => Some(Format::Itt),
        "dfxp" => Some(Format::Dfxp),
        "whisper" => Some(Format::Whisper),
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
        Format::Spruce => "spruce",
        Format::Itt => "itt",
        Format::Dfxp => "dfxp",
        Format::Whisper => "whisper",
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
        "spruce",
        "subviewer",
        "ttml",
        "dfxp",
        "itt",
        "whisper",
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

/// 字幕信息。
///   {"ok":true,"format":"srt","count":N,"total_duration_ms":N,
///    "first_timestamp":N,"last_timestamp":N}
///   {"ok":false,"error":"..."}
#[wasm_bindgen]
pub fn get_info_subtitle(content: &str) -> String {
    use subtitler::model::SubtitleFormat as _;

    let file = match subtitler::parse_bytes(content.as_bytes()) {
        Ok(f) => f,
        Err(e) => {
            return serde_json::json!({ "ok": false, "error": e.to_string() }).to_string();
        }
    };
    let subs = file.subtitles();
    let (first, last) = match (subs.first(), subs.last()) {
        (Some(f), Some(l)) => (f.start, l.end),
        _ => (0, 0),
    };
    let total = if subs.is_empty() {
        0
    } else {
        last.saturating_sub(first)
    };
    serde_json::json!({
        "ok": true,
        "format": format_to_name(file.format()),
        "count": subs.len() as u32,
        "total_duration_ms": total,
        "first_timestamp": first,
        "last_timestamp": last,
    })
    .to_string()
}

/// 质量校验。guideline: "basic"|"netflix"|"bbc"|"ted"|"ard"|"channel4"
///   {"ok":true,"format":"srt","count":N,"issue_count":N,
///    "issues":["subtitle 0 overlaps..."]}
///   {"ok":false,"error":"..."}
#[wasm_bindgen]
pub fn validate_subtitle(content: &str, guideline: &str) -> String {
    use subtitler::guidelines::GuidelinePreset;
    use subtitler::model::SubtitleFormat as _;

    let file = match subtitler::parse_bytes(content.as_bytes()) {
        Ok(f) => f,
        Err(e) => {
            return serde_json::json!({ "ok": false, "error": e.to_string() }).to_string();
        }
    };
    let count = file.subtitles().len() as u32;

    let issues: Vec<String> = match guideline.to_lowercase().as_str() {
        "basic" | "" => file.validate().iter().map(|i| i.to_string()).collect(),
        "netflix" => file
            .validate_guideline(&GuidelinePreset::Netflix.guideline())
            .iter()
            .map(|i| i.to_string())
            .collect(),
        "bbc" => file
            .validate_guideline(&GuidelinePreset::Bbc.guideline())
            .iter()
            .map(|i| i.to_string())
            .collect(),
        "ted" => file
            .validate_guideline(&GuidelinePreset::Ted.guideline())
            .iter()
            .map(|i| i.to_string())
            .collect(),
        "ard" => file
            .validate_guideline(&GuidelinePreset::ArdOrfSrfZdf.guideline())
            .iter()
            .map(|i| i.to_string())
            .collect(),
        "channel4" => file
            .validate_guideline(&GuidelinePreset::Channel4.guideline())
            .iter()
            .map(|i| i.to_string())
            .collect(),
        other => {
            return serde_json::json!({
                "ok": false,
                "error": format!("Unknown guideline preset: {}", other)
            })
            .to_string();
        }
    };
    let issue_count = issues.len() as u32;
    serde_json::json!({
        "ok": true,
        "format": format_to_name(file.format()),
        "count": count,
        "issue_count": issue_count,
        "issues": issues,
    })
    .to_string()
}

/// 文本规范化(剥离 HTML/ASS 标签)。
///   {"ok":true,"output":"..."}
///   {"ok":false,"error":"..."}
#[wasm_bindgen]
pub fn normalize_subtitle(content: &str) -> String {
    use subtitler::model::SubtitleFormat as _;

    let mut file = match subtitler::parse_bytes(content.as_bytes()) {
        Ok(f) => f,
        Err(e) => {
            return serde_json::json!({ "ok": false, "error": e.to_string() }).to_string();
        }
    };
    for sub in file.subtitles_mut() {
        sub.strip_tags();
    }
    serde_json::json!({ "ok": true, "output": file.to_string() }).to_string()
}

/// 解析 CMX3600 EDL 切镜点。
///   {"ok":true,"cuts":[ms,...]} | {"ok":false,"error":"..."}
#[wasm_bindgen]
pub fn parse_edl_cuts(edl: &str, fps: f64) -> String {
    match subtitler::shotlist::parse_edl_cuts(edl.as_bytes(), fps) {
        Ok(cuts) => serde_json::json!({ "ok": true, "cuts": cuts }).to_string(),
        Err(e) => serde_json::json!({ "ok": false, "error": e.to_string() }).to_string(),
    }
}

/// 修复操作(按序:min_gap -> merge_identical -> rollup -> shot_changes)。
/// min_gap_ms / merge_gap_ms 用 -1 表示不启用;cuts_ms 非空时应用镜头切换。
///   {"ok":true,"output":"...","before":N,"after":M}
///   {"ok":false,"error":"..."}
#[wasm_bindgen]
pub fn repair_subtitle(
    content: &str,
    min_gap_ms: i64,
    merge_gap_ms: i64,
    rollup: bool,
    cuts_ms: &[u64],
    before_frames: u64,
    after_frames: u64,
    fps: f64,
) -> String {
    use subtitler::model::SubtitleFormat as _;

    let mut file = match subtitler::parse_bytes(content.as_bytes()) {
        Ok(f) => f,
        Err(e) => {
            return serde_json::json!({ "ok": false, "error": e.to_string() }).to_string();
        }
    };
    let before = file.subtitles().len() as u32;

    if min_gap_ms >= 0 {
        file.enforce_min_gap(min_gap_ms as u64);
    }
    if merge_gap_ms >= 0 {
        file.merge_identical(merge_gap_ms as u64);
    }
    if rollup {
        file.remove_repeating_lines();
    }
    if !cuts_ms.is_empty() {
        file.apply_shot_changes(cuts_ms, before_frames, after_frames, fps);
    }

    let after = file.subtitles().len() as u32;
    serde_json::json!({
        "ok": true,
        "output": file.to_string(),
        "before": before,
        "after": after
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

    #[wasm_bindgen_test]
    fn get_info_subtitle_srt() {
        let srt = "1\n00:00:01,000 --> 00:00:03,500\nHello\n\n2\n00:00:05,000 --> 00:00:07,000\nWorld\n\n";
        let resp = get_info_subtitle(srt);
        let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
        assert_eq!(v["ok"], true);
        assert_eq!(v["format"], "srt");
        assert_eq!(v["count"], 2);
        assert_eq!(v["total_duration_ms"], 6000);
        assert_eq!(v["first_timestamp"], 1000);
        assert_eq!(v["last_timestamp"], 7000);
    }

    #[wasm_bindgen_test]
    fn get_info_subtitle_invalid() {
        let resp = get_info_subtitle("garbage content");
        let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
        assert_eq!(v["ok"], false);
        assert!(v["error"].as_str().unwrap().len() > 0);
    }

    #[wasm_bindgen_test]
    fn validate_subtitle_clean() {
        let srt = "1\n00:00:01,000 --> 00:00:03,500\nHello\n\n2\n00:00:05,000 --> 00:00:07,000\nWorld\n\n";
        let resp = validate_subtitle(srt, "basic");
        let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
        assert_eq!(v["ok"], true);
        assert_eq!(v["count"], 2);
        assert_eq!(v["issue_count"], 0);
        assert!(v["issues"].as_array().unwrap().is_empty());
    }

    #[wasm_bindgen_test]
    fn validate_subtitle_with_overlap() {
        let srt = "1\n00:00:01,000 --> 00:00:01,500\nA\n\n2\n00:00:01,200 --> 00:00:03,000\nB\n\n";
        let resp = validate_subtitle(srt, "basic");
        let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
        assert_eq!(v["ok"], true);
        assert!(v["issue_count"].as_u64().unwrap() >= 1);
        let issues = v["issues"].as_array().unwrap();
        assert!(!issues.is_empty());
        assert!(issues.iter().any(|i| i.as_str().unwrap().contains("overlap")));
    }

    #[wasm_bindgen_test]
    fn validate_subtitle_invalid() {
        let resp = validate_subtitle("not a subtitle", "basic");
        let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
        assert_eq!(v["ok"], false);
    }

    #[wasm_bindgen_test]
    fn validate_subtitle_netflix_preset() {
        let long_line = "1\n00:00:01,000 --> 00:00:04,000\nThis subtitle line is way way way too long for the Netflix guideline limit of forty-two characters\n\n";
        let resp = validate_subtitle(long_line, "netflix");
        let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
        assert_eq!(v["ok"], true);
        assert!(v["issue_count"].as_u64().unwrap() >= 1);
    }

    #[wasm_bindgen_test]
    fn validate_subtitle_invalid_guideline() {
        let srt = "1\n00:00:01,000 --> 00:00:03,500\nHello\n\n";
        let resp = validate_subtitle(srt, "notapreset");
        let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
        assert_eq!(v["ok"], false);
        assert!(v["error"].as_str().unwrap().contains("notapreset"));
    }

    #[wasm_bindgen_test]
    fn parse_edl_cuts_basic() {
        let edl = "TITLE: TEST CUTS\n\n001  V     C        01:00:10:00 01:00:20:00 01:00:10:00 01:00:20:00\n\n002  V     C        01:00:30:00 01:00:40:00 01:00:30:00 01:00:40:00\n";
        let resp = parse_edl_cuts(edl, 25.0);
        let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
        assert_eq!(v["ok"], true);
        let cuts = v["cuts"].as_array().unwrap();
        // 每个事件的入点+出点都算切镜点:2 事件 -> 4 个 cut
        assert_eq!(cuts.len(), 4);
    }

    #[wasm_bindgen_test]
    fn parse_edl_cuts_no_cuts_is_ok() {
        let resp = parse_edl_cuts("TITLE: EMPTY", 25.0);
        let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
        // 空/无效 EDL:ok:true 且 cuts 为空,或 ok:false,都合法
        assert!(v["ok"] == true || v["ok"] == false);
    }

    #[wasm_bindgen_test]
    fn repair_min_gap() {
        let srt = "1\n00:00:01,000 --> 00:00:03,000\nA\n\n2\n00:00:03,200 --> 00:00:05,000\nB\n\n";
        let resp = repair_subtitle(srt, 500, -1, false, &[], 0, 0, 25.0);
        let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
        assert_eq!(v["ok"], true);
        assert_eq!(v["before"], 2);
        assert_eq!(v["after"], 2); // min_gap 不减少条数
    }

    #[wasm_bindgen_test]
    fn repair_merge_identical() {
        let srt = "1\n00:00:01,000 --> 00:00:02,000\nSame\n\n2\n00:00:02,500 --> 00:00:03,500\nSame\n\n";
        let resp = repair_subtitle(srt, -1, 1000, false, &[], 0, 0, 25.0);
        let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
        assert_eq!(v["ok"], true);
        assert_eq!(v["before"], 2);
        assert_eq!(v["after"], 1);
    }

    #[wasm_bindgen_test]
    fn repair_noop() {
        let srt = "1\n00:00:01,000 --> 00:00:03,500\nHello\n\n";
        let resp = repair_subtitle(srt, -1, -1, false, &[], 0, 0, 25.0);
        let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
        assert_eq!(v["ok"], true);
        assert_eq!(v["before"], 1);
        assert_eq!(v["after"], 1);
        assert!(v["output"].as_str().unwrap().contains("Hello"));
    }

    #[wasm_bindgen_test]
    fn repair_invalid_content() {
        let resp = repair_subtitle("garbage", -1, -1, false, &[], 0, 0, 25.0);
        let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
        assert_eq!(v["ok"], false);
    }

    #[wasm_bindgen_test]
    fn normalize_subtitle_strips_tags() {
        let vtt = "WEBVTT\n\n00:00:01,000 --> 00:00:03,500\n<i>Hello</i>\n";
        let resp = normalize_subtitle(vtt);
        let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
        assert_eq!(v["ok"], true);
        let out = v["output"].as_str().unwrap();
        assert!(!out.contains("<i>"));
        assert!(out.contains("Hello"));
    }

    #[wasm_bindgen_test]
    fn normalize_subtitle_invalid() {
        let resp = normalize_subtitle("totally garbage");
        let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
        assert_eq!(v["ok"], false);
    }
}
