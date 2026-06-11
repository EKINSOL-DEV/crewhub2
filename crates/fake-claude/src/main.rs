//! Scenario-driven stand-in for the `claude` CLI.
//!
//! Reads a scenario file (JSONL of directives) from `FAKE_CLAUDE_SCENARIO` and
//! plays it back, so engine integration tests are deterministic and need no API.
//!
//! Directives:
//! - {"emit": {...}}                 -> print the JSON object as one stdout line
//! - {"expect_stdin": {"contains": "s"}} -> read one stdin line, exit 9 if it lacks `s`
//! - {"expect_arg": "s"}             -> exit 8 unless some argv element equals/contains `s`
//! - {"write_transcript": {...}}     -> append JSON line to `FAKE_CLAUDE_TRANSCRIPT`
//! - {"sleep_ms": 50}                -> sleep
//! - {"exit": 0}                     -> exit with code

use serde_json::Value;
use std::io::{BufRead, Write};

fn main() {
    let scenario_path =
        std::env::var("FAKE_CLAUDE_SCENARIO").expect("FAKE_CLAUDE_SCENARIO not set");
    let scenario = std::fs::read_to_string(&scenario_path).expect("scenario unreadable");
    let args: Vec<String> = std::env::args().collect();
    let stdin = std::io::stdin();
    let mut stdin_lines = stdin.lock().lines();
    let mut stdout = std::io::stdout();

    for raw in scenario.lines() {
        let raw = raw.trim();
        if raw.is_empty() {
            continue;
        }
        let directive: Value = serde_json::from_str(raw).expect("bad directive");
        let obj = directive.as_object().expect("directive must be object");

        if let Some(payload) = obj.get("emit") {
            writeln!(stdout, "{payload}").unwrap();
            stdout.flush().unwrap();
        } else if let Some(exp) = obj.get("expect_stdin") {
            let needle = exp
                .get("contains")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let line = stdin_lines.next().and_then(Result::ok).unwrap_or_default();
            if !line.contains(needle) {
                eprintln!("expect_stdin failed: wanted {needle:?} in {line:?}");
                std::process::exit(9);
            }
        } else if let Some(needle) = obj.get("expect_arg").and_then(Value::as_str) {
            if !args.iter().any(|a| a.contains(needle)) {
                eprintln!("expect_arg failed: {needle:?} not in {args:?}");
                std::process::exit(8);
            }
        } else if let Some(line) = obj.get("write_transcript") {
            let path =
                std::env::var("FAKE_CLAUDE_TRANSCRIPT").expect("FAKE_CLAUDE_TRANSCRIPT not set");
            let mut f = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(path)
                .unwrap();
            writeln!(f, "{line}").unwrap();
        } else if let Some(ms) = obj.get("sleep_ms").and_then(Value::as_u64) {
            std::thread::sleep(std::time::Duration::from_millis(ms));
        } else if let Some(code) = obj.get("exit").and_then(Value::as_i64) {
            std::process::exit(code as i32);
        } else {
            eprintln!("unknown directive: {raw}");
            std::process::exit(7);
        }
    }
}
