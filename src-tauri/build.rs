fn main() {
    #[cfg(target_os = "macos")]
    macos_link_swift_runtime();
    #[cfg(target_os = "macos")]
    embed_info_plist();
    tauri_build::build()
}

/// `tauri dev` runs the raw `interviewveil` binary, not InterviewVeil.app.
/// Embed usage-description keys so macOS TCC can prompt for screen + mic.
#[cfg(target_os = "macos")]
fn embed_info_plist() {
    use std::env;
    use std::path::PathBuf;

    let plist = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"))
        .join("Info.dev.plist");
    println!("cargo:rerun-if-changed={}", plist.display());
    println!(
        "cargo:rustc-link-arg=-Wl,-sectcreate,__TEXT,__info_plist,{}",
        plist.display()
    );
}

/// ScreenCaptureKit's Swift bridge records a load of
/// `@rpath/libswift_Concurrency.dylib`. Add `/usr/lib/swift` as an rpath so
/// dyld uses the OS copy. Do not ship a second toolchain dylib — that
/// duplicates Swift concurrency classes at launch.
#[cfg(target_os = "macos")]
fn macos_link_swift_runtime() {
    use std::env;
    use std::fs;
    use std::path::PathBuf;

    println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");

    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let profile = env::var("PROFILE").expect("PROFILE");
    let leftover = env::var("CARGO_TARGET_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| manifest_dir.join("target"))
        .join(&profile)
        .join("libswift_Concurrency.dylib");
    if leftover.exists() {
        let _ = fs::remove_file(&leftover);
    }
}
