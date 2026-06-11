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
//! - {"mcp_call": {"name": "create_task", "arguments": {...},
//!   "save": {"TASK_ID": "/structuredContent/task/id"}}} -> POST a
//!   `tools/call` to the CrewHub MCP server at `CREWHUB_MCP_URL` with bearer
//!   `CREWHUB_MCP_TOKEN` (the M3 `mcp-board` scenario, EKI-97). `${VAR}`
//!   placeholders in argument strings substitute from earlier `save`s, then
//!   the environment. Exit 6 on transport/HTTP/tool errors. Raw std TcpStream
//!   HTTP/1.1 — the bin has no deps.

use serde_json::Value;
use std::collections::HashMap;
use std::io::{BufRead, Read, Write};

/// Replace `${NAME}` placeholders from `vars`, falling back to the environment.
fn substitute(s: &str, vars: &HashMap<String, String>) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(start) = rest.find("${") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        match after.find('}') {
            Some(end) => {
                let name = &after[..end];
                match vars.get(name).cloned().or_else(|| std::env::var(name).ok()) {
                    Some(v) => out.push_str(&v),
                    None => {
                        eprintln!("mcp_call: unknown variable ${{{name}}}");
                        std::process::exit(6);
                    }
                }
                rest = &after[end + 1..];
            }
            None => {
                out.push_str(&rest[start..]);
                rest = "";
            }
        }
    }
    out.push_str(rest);
    out
}

fn substitute_value(v: &Value, vars: &HashMap<String, String>) -> Value {
    match v {
        Value::String(s) => Value::String(substitute(s, vars)),
        Value::Array(items) => {
            Value::Array(items.iter().map(|i| substitute_value(i, vars)).collect())
        }
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(k, val)| (k.clone(), substitute_value(val, vars)))
                .collect(),
        ),
        other => other.clone(),
    }
}

/// Minimal HTTP/1.1 POST over a raw TcpStream (local plaintext only).
/// Returns the parsed JSON body or exits 6 on any transport/HTTP failure.
fn http_post_json(url: &str, token: &str, body: &Value) -> Value {
    let Some(rest) = url.strip_prefix("http://") else {
        eprintln!("mcp_call: only http:// URLs are supported, got {url}");
        std::process::exit(6);
    };
    let (host, path) = match rest.find('/') {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, "/"),
    };
    let payload = body.to_string();
    let request = format!(
        "POST {path} HTTP/1.1\r\nHost: {host}\r\nAuthorization: Bearer {token}\r\n\
         Content-Type: application/json\r\nAccept: application/json, text/event-stream\r\n\
         Content-Length: {}\r\nConnection: close\r\n\r\n{payload}",
        payload.len()
    );
    let mut stream = match std::net::TcpStream::connect(host) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("mcp_call: connect to {host} failed: {e}");
            std::process::exit(6);
        }
    };
    stream.write_all(request.as_bytes()).unwrap();
    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).unwrap();
    let text = String::from_utf8_lossy(&raw);
    let Some((head, body_text)) = text.split_once("\r\n\r\n") else {
        eprintln!("mcp_call: malformed HTTP response");
        std::process::exit(6);
    };
    let status_line = head.lines().next().unwrap_or_default();
    if !status_line.contains(" 200") {
        eprintln!("mcp_call: HTTP error: {status_line}");
        std::process::exit(6);
    }
    let chunked = head
        .lines()
        .any(|l| l.to_ascii_lowercase().starts_with("transfer-encoding") && l.contains("chunked"));
    let body_text = if chunked {
        dechunk(body_text)
    } else {
        body_text.to_string()
    };
    match serde_json::from_str(body_text.trim()) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("mcp_call: bad JSON body ({e}): {body_text}");
            std::process::exit(6);
        }
    }
}

/// Decode an HTTP/1.1 chunked body (hex size line + chunk, until a 0 chunk).
fn dechunk(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    loop {
        let Some((size_line, after)) = rest.split_once("\r\n") else {
            return out;
        };
        let size = usize::from_str_radix(size_line.trim(), 16).unwrap_or(0);
        if size == 0 {
            return out;
        }
        out.push_str(&after[..size.min(after.len())]);
        rest = after.get(size + 2..).unwrap_or(""); // skip chunk + trailing CRLF
    }
}

/// One `tools/call` round-trip; captures `save` pointers into `vars`.
fn mcp_call(spec: &Value, vars: &mut HashMap<String, String>) {
    let url = std::env::var("CREWHUB_MCP_URL").expect("CREWHUB_MCP_URL not set");
    let token = std::env::var("CREWHUB_MCP_TOKEN").expect("CREWHUB_MCP_TOKEN not set");
    let name = spec
        .get("name")
        .and_then(Value::as_str)
        .expect("mcp_call needs a tool name");
    let arguments = substitute_value(spec.get("arguments").unwrap_or(&Value::Null), vars);
    let body = serde_json::json!({
        "jsonrpc": "2.0", "id": 1, "method": "tools/call",
        "params": { "name": name, "arguments": arguments }
    });
    let reply = http_post_json(&url, &token, &body);
    if reply.get("error").is_some() {
        eprintln!("mcp_call {name}: RPC error: {reply}");
        std::process::exit(6);
    }
    let result = &reply["result"];
    if result.get("isError") == Some(&Value::Bool(true)) {
        eprintln!("mcp_call {name}: tool error: {result}");
        std::process::exit(6);
    }
    if let Some(saves) = spec.get("save").and_then(Value::as_object) {
        for (var, pointer) in saves {
            let pointer = pointer.as_str().expect("save pointer must be a string");
            let Some(value) = result.pointer(pointer).and_then(Value::as_str) else {
                eprintln!("mcp_call {name}: nothing at {pointer} in {result}");
                std::process::exit(6);
            };
            vars.insert(var.clone(), value.to_string());
        }
    }
}

fn main() {
    let scenario_path =
        std::env::var("FAKE_CLAUDE_SCENARIO").expect("FAKE_CLAUDE_SCENARIO not set");
    let scenario = std::fs::read_to_string(&scenario_path).expect("scenario unreadable");
    let args: Vec<String> = std::env::args().collect();
    let stdin = std::io::stdin();
    let mut stdin_lines = stdin.lock().lines();
    let mut stdout = std::io::stdout();
    let mut vars: HashMap<String, String> = HashMap::new();

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
        } else if let Some(spec) = obj.get("mcp_call") {
            mcp_call(spec, &mut vars);
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
