use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;
use sysinfo::System;
use wait_timeout::ChildExt;

#[derive(Serialize)]
struct NativeResult {
    success: bool,
    capability: String,
    verified: bool,
    data: Option<Value>,
    error: Option<String>,
}

fn success(capability: &str, data: Value) -> NativeResult {
    NativeResult { success: true, capability: capability.into(), verified: true, data: Some(data), error: None }
}

fn failure(capability: &str, error: impl Into<String>) -> NativeResult {
    NativeResult { success: false, capability: capability.into(), verified: false, data: None, error: Some(error.into()) }
}

fn string_input(input: &Value, key: &str) -> Result<String, String> {
    input.get(key).and_then(Value::as_str).map(str::trim).filter(|value| !value.is_empty()).map(String::from)
        .ok_or_else(|| format!("Missing required input: {key}"))
}

fn lexically_normalize(path: &std::path::Path) -> PathBuf {
    use std::path::Component;
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

fn resolve_under_home(normalized: &std::path::Path, home: &std::path::Path) -> Option<PathBuf> {
    use std::path::Component;
    if let Ok(canonical) = fs::canonicalize(normalized) {
        return canonical.starts_with(home).then_some(canonical);
    }
    let ancestors = normalized.ancestors().collect::<Vec<_>>();
    for ancestor in ancestors.iter().skip(1) {
        if let Ok(canonical_ancestor) = fs::canonicalize(ancestor) {
            if !canonical_ancestor.starts_with(home) {
                return None;
            }
            let remainder = normalized.strip_prefix(ancestor).ok()?;
            if remainder.components().any(|component| {
                matches!(component, Component::ParentDir | Component::RootDir | Component::Prefix(_))
            }) {
                return None;
            }
            let mut joined = canonical_ancestor;
            for component in remainder.components() {
                joined.push(component.as_os_str());
            }
            return Some(joined);
        }
    }
    None
}

fn allowed_path(raw: &str) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(raw);
    let absolute = if candidate.is_absolute() { candidate } else { std::env::current_dir().map_err(|error| error.to_string())?.join(candidate) };
    let normalized = lexically_normalize(&absolute);
    let home = dirs_home().ok_or_else(|| "Could not determine the user home directory.".to_string())?;
    if !normalized.starts_with(&home) {
        return Err("Filesystem access is limited to the user home directory.".into());
    }
    resolve_under_home(&normalized, &home)
        .ok_or_else(|| "Filesystem access is limited to the user home directory.".into())
}

fn dirs_home() -> Option<PathBuf> {
    #[cfg(windows)]
    { std::env::var_os("USERPROFILE").map(PathBuf::from) }
    #[cfg(not(windows))]
    { std::env::var_os("HOME").map(PathBuf::from) }
}

fn valid_http_url(raw: &str) -> Result<String, String> {
    let url = raw.trim();
    if url.is_empty() || url.chars().any(|character| character.is_control() || character.is_whitespace()) {
        return Err("The URL is empty or contains invalid characters.".into());
    }
    if url.chars().any(|character| matches!(character, '"' | '\\' | '<' | '>' | '`' | '\'')) {
        return Err("The URL contains characters that are not allowed.".into());
    }
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Only HTTP and HTTPS URLs can be opened.".into());
    }
    let host = url.split_once("://").and_then(|(_, rest)| rest.split('/').next()).unwrap_or("");
    if host.is_empty() || host.contains(':') && host.ends_with(':') {
        return Err("The URL must include a valid host.".into());
    }
    Ok(url.to_string())
}

fn chrome_executable() -> Option<PathBuf> {
    let candidates = if cfg!(target_os = "windows") {
        vec![
            std::env::var_os("PROGRAMFILES").map(|root| PathBuf::from(root).join("Google/Chrome/Application/chrome.exe")),
            std::env::var_os("PROGRAMFILES(X86)").map(|root| PathBuf::from(root).join("Google/Chrome/Application/chrome.exe")),
            std::env::var_os("LOCALAPPDATA").map(|root| PathBuf::from(root).join("Google/Chrome/Application/chrome.exe")),
        ]
    } else if cfg!(target_os = "macos") {
        vec![Some(PathBuf::from("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"))]
    } else {
        vec![Some(PathBuf::from("google-chrome")), Some(PathBuf::from("google-chrome-stable")), Some(PathBuf::from("chromium")), Some(PathBuf::from("chromium-browser"))]
    };

    candidates.into_iter().flatten().find(|candidate| candidate.exists()).or_else(|| {
        if cfg!(target_os = "windows") { None } else { Some(PathBuf::from("google-chrome")) }
    })
}

fn launch_chrome(capability: &str, input: &Value) -> NativeResult {
    if capability == "app.open" {
        let target = input.get("target").and_then(Value::as_str).unwrap_or("").trim().to_lowercase();
        if target != "chrome" && target != "google chrome" {
            return failure(capability, "This vertical slice supports Google Chrome only.");
        }
    }
    let executable = match chrome_executable() {
        Some(path) => path,
        None => return failure(capability, "Google Chrome was not found on this desktop."),
    };
    let url = input.get("url").and_then(Value::as_str).map(valid_http_url).transpose();
    let url = match url {
        Ok(url) => url,
        Err(error) => return failure(capability, error),
    };
    let mut command = Command::new(&executable);
    command.arg("--new-window");
    if let Some(url) = &url { command.arg(url); } else { command.arg("about:blank"); }
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => return failure(capability, format!("Could not launch Chrome: {error}")),
    };
    match child.try_wait() {
        Ok(None) => success(capability, serde_json::json!({
            "application": "Google Chrome",
            "processId": child.id(),
            "url": url,
            "verification": "chrome_process_started_with_requested_url",
        })),
        Ok(Some(status)) => failure(capability, format!("Chrome exited before the request could be accepted: {status}")),
        Err(error) => failure(capability, format!("Chrome launched but could not be verified: {error}")),
    }
}

fn execute_filesystem(capability: &str, input: &Value) -> NativeResult {
    let path = match string_input(input, "path").and_then(|value| allowed_path(&value)) { Ok(path) => path, Err(error) => return failure(capability, error) };
    let operation = match capability {
        "filesystem.read" => fs::read_to_string(&path).map(|content| serde_json::json!({ "path": path, "content": content })),
        "filesystem.write" => {
            let content = match string_input(input, "content") { Ok(content) => content, Err(error) => return failure(capability, error) };
            fs::write(&path, content).map(|_| serde_json::json!({ "path": path, "bytes": fs::metadata(&path).map(|metadata| metadata.len()).unwrap_or(0) }))
        }
        "filesystem.create_directory" => fs::create_dir_all(&path).map(|_| serde_json::json!({ "path": path })),
        "filesystem.list" => fs::read_dir(&path).and_then(|entries| entries.map(|entry| entry.map(|item| serde_json::json!({ "name": item.file_name(), "path": item.path(), "isDirectory": item.file_type().map(|kind| kind.is_dir()).unwrap_or(false) }))).collect::<Result<Vec<_>, _>>().map(|items| serde_json::json!({ "path": path, "items": items }))),
        "filesystem.delete" => {
            if input.get("confirmed") != Some(&Value::Bool(true)) { return failure(capability, "Deletion requires explicit confirmation."); }
            if path.is_dir() { fs::remove_dir_all(&path).map(|_| serde_json::json!({ "path": path })) } else { fs::remove_file(&path).map(|_| serde_json::json!({ "path": path })) }
        }
        _ => return failure(capability, "Filesystem capability is not implemented by this adapter."),
    };
    match operation {
        Ok(data) => success(capability, data),
        Err(error) => failure(capability, error.to_string()),
    }
}

fn unsafe_invocation(program: &str, args: &[&str]) -> bool {
    // These invocations defeat the executable allowlist by running arbitrary
    // code (Node eval flags, npm/npx script execution). They are always blocked
    // regardless of the configured allowlist.
    match program {
        "node" | "node.exe" => args.iter().any(|arg| {
            matches!(*arg, "-e" | "--eval" | "-p" | "--print" | "-pe" | "-i" | "--interactive")
        }),
        "npm" | "npm.cmd" => args.first().is_some_and(|first| matches!(*first, "exec" | "x" | "exec --")),
        "npx" | "npx.cmd" => true,
        "git" => args.first().is_some_and(|first| matches!(*first, "commit" | "push" | "merge" | "rebase" | "am" | "apply" | "revert" | "cherry-pick" | "stash" | "filter-branch")),
        _ => false,
    }
}

fn execute_terminal(capability: &str, input: &Value) -> NativeResult {
    let program = match string_input(input, "program") { Ok(program) => program, Err(error) => return failure(capability, error) };
    let configured = std::env::var("HEY_ALLOWED_COMMANDS").unwrap_or_else(|_| "node,npm,git,cargo,rustc".into());
    let allowed = configured.split(',').map(str::trim).filter(|item| !item.is_empty()).any(|item| item == program);
    if !allowed { return failure(capability, "This executable is not on the HEY command allowlist."); }
    let args = input.get("args").and_then(Value::as_array).cloned().unwrap_or_default();
    if args.len() > 32 || args.iter().any(|arg| arg.as_str().map(|value| value.len() > 1000).unwrap_or(true)) {
        return failure(capability, "Command arguments are invalid or exceed the safety limits.");
    }
    let arg_strings = args.iter().filter_map(Value::as_str).collect::<Vec<_>>();
    if unsafe_invocation(&program, &arg_strings) {
        return failure(capability, "This invocation is not permitted by the HEY command policy.");
    }
    let working_directory = match input.get("workingDirectory").and_then(Value::as_str) {
        Some(path) => match allowed_path(path) { Ok(path) => Some(path), Err(error) => return failure(capability, error) },
        None => None,
    };
    let timeout_ms = input.get("timeoutMs").and_then(Value::as_u64).unwrap_or(10_000).clamp(100, 30_000);
    let started = std::time::Instant::now();
    let mut command = Command::new(&program);
    command.args(arg_strings).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    if let Some(directory) = working_directory { command.current_dir(directory); }
    let mut child = match command.spawn() { Ok(child) => child, Err(error) => return failure(capability, error.to_string()) };
    let status = match child.wait_timeout(Duration::from_millis(timeout_ms)) {
        Ok(Some(status)) => status,
        Ok(None) => {
            let _ = child.kill();
            let _ = child.wait();
            return failure(capability, format!("Command exceeded the {timeout_ms}ms timeout."));
        }
        Err(error) => return failure(capability, error.to_string()),
    };
    let output = match child.wait_with_output() { Ok(output) => output, Err(error) => return failure(capability, error.to_string()) };
    let limit = 64 * 1024;
    let stdout = String::from_utf8_lossy(&output.stdout).chars().take(limit).collect::<String>();
    let stderr = String::from_utf8_lossy(&output.stderr).chars().take(limit).collect::<String>();
    if !status.success() { return NativeResult { success: false, capability: capability.into(), verified: false, data: Some(serde_json::json!({ "exitCode": status.code(), "stdout": stdout, "stderr": stderr, "durationMs": started.elapsed().as_millis() })), error: Some("Command exited with a failure status.".into()) }; }
    success(capability, serde_json::json!({ "exitCode": status.code().unwrap_or(0), "stdout": stdout, "stderr": stderr, "durationMs": started.elapsed().as_millis() }))
}

#[tauri::command]
fn native_capabilities() -> Value {
    serde_json::json!(["system.info", "browser.open_url", "app.open", "browser.navigate", "filesystem.read", "filesystem.write", "filesystem.create_directory", "filesystem.list", "filesystem.delete", "terminal.execute"])
}

#[tauri::command]
fn native_execute(capability: String, input: Value) -> NativeResult {
    match capability.as_str() {
        "system.info" => {
            let mut system = System::new_all();
            system.refresh_all();
            success(&capability, serde_json::json!({ "os": System::name(), "osVersion": System::os_version(), "kernel": System::kernel_version(), "cpuCores": system.cpus().len(), "memoryBytes": system.total_memory(), "availableMemoryBytes": system.available_memory() }))
        }
        "browser.open_url" => {
            let url = match string_input(&input, "url") { Ok(url) => url, Err(error) => return failure(&capability, error) };
            let url = match valid_http_url(&url) { Ok(url) => url, Err(error) => return failure(&capability, error) };
            // Windows: pass the URL as an argument (no shell involved) so it can
            // never be interpreted as cmd metacharacters. macOS/Linux openers
            // already receive argv directly from the OS.
            let result = if cfg!(target_os = "windows") { std::process::Command::new("rundll32").args(["url.dll,FileProtocolHandler", &url]).status() } else if cfg!(target_os = "macos") { std::process::Command::new("open").arg(&url).status() } else { std::process::Command::new("xdg-open").arg(&url).status() };
            match result { Ok(status) if status.success() => success(&capability, serde_json::json!({ "url": url })), Ok(status) => failure(&capability, format!("The OS opener exited with status {status}.")), Err(error) => failure(&capability, error.to_string()) }
        }
        "app.open" | "browser.navigate" => launch_chrome(&capability, &input),
        "filesystem.read" | "filesystem.write" | "filesystem.create_directory" | "filesystem.list" | "filesystem.delete" => execute_filesystem(&capability, &input),
        "terminal.execute" => execute_terminal(&capability, &input),
        _ => failure(&capability, "This native capability is unavailable in the installed HEY adapter."),
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![native_capabilities, native_execute])
        .run(tauri::generate_context!())
        .expect("error while running HEY");
}
