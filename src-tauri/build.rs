use std::path::PathBuf;
use std::process::Command;

fn main() {
    let target = std::env::var("TARGET").expect("cargo sets TARGET");
    // Compile-time triple for the dev/test sidecar fallback (hooks::sidecar_path).
    println!("cargo:rustc-env=CREWHUB_TARGET_TRIPLE={target}");
    build_sidecar(&target);
    tauri_build::build()
}

/// M6 T1 (D-M6-1): build `crewhub-signal` and drop it where
/// `bundle.externalBin` expects it (`binaries/crewhub-signal-<triple>`), so
/// plain `cargo` builds, `tauri dev` and bundling are all self-sufficient.
/// Uses a dedicated target dir — nested cargo must not contend for the outer
/// build lock. Escape hatch: set CREWHUB_SKIP_SIDECAR_BUILD=1 (with prebuilt
/// binaries in place) for exotic cross-compile setups.
fn build_sidecar(target: &str) {
    println!("cargo:rerun-if-changed=../crates/crewhub-signal/src");
    println!("cargo:rerun-if-changed=../crates/crewhub-signal/Cargo.toml");
    println!("cargo:rerun-if-env-changed=CREWHUB_SKIP_SIDECAR_BUILD");
    if std::env::var_os("CREWHUB_SKIP_SIDECAR_BUILD").is_some() {
        return;
    }
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let workspace = manifest_dir.parent().expect("src-tauri has a parent");
    let sidecar_target = PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("sidecar-target");
    let cargo = std::env::var("CARGO").unwrap_or_else(|_| "cargo".into());
    let status = Command::new(cargo)
        .current_dir(workspace)
        .args([
            "build",
            "--release",
            "-p",
            "crewhub-signal",
            "--target",
            target,
            "--target-dir",
        ])
        .arg(&sidecar_target)
        .status()
        .expect("failed to invoke cargo for the crewhub-signal sidecar");
    assert!(status.success(), "crewhub-signal sidecar build failed");

    let exe = if target.contains("windows") {
        ".exe"
    } else {
        ""
    };
    let built = sidecar_target
        .join(target)
        .join("release")
        .join(format!("crewhub-signal{exe}"));
    let dest_dir = manifest_dir.join("binaries");
    std::fs::create_dir_all(&dest_dir).unwrap();
    let dest = dest_dir.join(format!("crewhub-signal-{target}{exe}"));
    std::fs::copy(&built, &dest)
        .unwrap_or_else(|e| panic!("copying sidecar {built:?} -> {dest:?}: {e}"));
}
