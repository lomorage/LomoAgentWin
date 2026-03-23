// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

struct AppState {
    lomod_process: Option<Child>,
    proxy_process: Option<Child>,
}

/// Strip the `\\?\` extended-length path prefix that Windows/Tauri adds.
/// Node.js and some tools don't handle this prefix correctly.
fn clean_path(p: &std::path::Path) -> PathBuf {
    let s = p.to_string_lossy();
    if s.starts_with(r"\\?\") {
        PathBuf::from(&s[4..])
    } else {
        p.to_path_buf()
    }
}

fn path_str(p: &std::path::Path) -> String {
    clean_path(p).to_string_lossy().to_string()
}

fn start_lomod(resource_dir: &std::path::Path, data_dir: &std::path::Path) -> Option<Child> {
    let lomod_dir = clean_path(&resource_dir.join("lomod"));
    let lomod_exe = lomod_dir.join("lomod.exe");

    if !lomod_exe.exists() {
        eprintln!("[tauri] lomod.exe not found at {:?}, skipping", lomod_exe);
        return None;
    }

    let mount_dir = clean_path(&data_dir.join("photos"));
    let base_dir = clean_path(&data_dir.join("data"));

    std::fs::create_dir_all(&mount_dir).ok();
    std::fs::create_dir_all(&base_dir).ok();

    println!("[tauri] Starting lomod: {:?}", lomod_exe);
    println!("[tauri]   mount-dir: {:?}", mount_dir);
    println!("[tauri]   base: {:?}", base_dir);
    println!("[tauri]   exe-dir: {:?}", lomod_dir);

    match Command::new(&lomod_exe)
        .args([
            "--mount-dir",
            &path_str(&mount_dir),
            "--base",
            &path_str(&base_dir),
            "--exe-dir",
            &path_str(&lomod_dir),
            "--port",
            "8000",
            "--admin-token",
            "123456",
        ])
        .spawn()
    {
        Ok(child) => {
            println!("[tauri] lomod started (pid {})", child.id());
            Some(child)
        }
        Err(e) => {
            eprintln!("[tauri] Failed to start lomod: {}", e);
            None
        }
    }
}

/// Extract web.zip from resources to data_dir/web if not already extracted
/// or if the zip is newer than the extracted directory.
fn extract_web_zip(resource_dir: &std::path::Path, data_dir: &std::path::Path) -> PathBuf {
    let zip_path = clean_path(&resource_dir.join("web.zip"));
    let web_dir = data_dir.join("web");
    let marker = web_dir.join(".extracted");

    // Check if already extracted (marker file exists and zip hasn't changed)
    let needs_extract = if marker.exists() && web_dir.join("index.html").exists() {
        // Compare zip modification time with marker
        let zip_modified = std::fs::metadata(&zip_path).ok().and_then(|m| m.modified().ok());
        let marker_modified = std::fs::metadata(&marker).ok().and_then(|m| m.modified().ok());
        match (zip_modified, marker_modified) {
            (Some(z), Some(m)) => z > m,
            _ => true,
        }
    } else {
        true
    };

    if needs_extract {
        println!("[tauri] Extracting web.zip to {:?}", web_dir);
        // Remove old web dir
        if web_dir.exists() {
            std::fs::remove_dir_all(&web_dir).ok();
        }
        std::fs::create_dir_all(&web_dir).ok();

        if let Err(e) = do_extract_zip(&zip_path, &web_dir) {
            eprintln!("[tauri] Failed to extract web.zip: {}", e);
        } else {
            // Write marker file
            std::fs::write(&marker, "ok").ok();
            println!("[tauri] Web files extracted successfully");
        }
    } else {
        println!("[tauri] Web files already extracted, skipping");
    }

    web_dir
}

fn do_extract_zip(zip_path: &std::path::Path, dest: &std::path::Path) -> io::Result<()> {
    let file = std::fs::File::open(zip_path)?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)
            .map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;
        let out_path = dest.join(entry.mangled_name());

        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut outfile = std::fs::File::create(&out_path)?;
            io::copy(&mut entry, &mut outfile)?;
        }
    }
    Ok(())
}

fn start_proxy(resource_dir: &std::path::Path, data_dir: &std::path::Path) -> Option<Child> {
    let proxy_exe = clean_path(&resource_dir.join("proxy.exe"));
    // Use extracted web files from data_dir (preserves directory structure)
    let web_dir = clean_path(&data_dir.join("web"));

    if !proxy_exe.exists() {
        eprintln!("[tauri] proxy.exe not found at {:?}, skipping", proxy_exe);
        return None;
    }

    println!("[tauri] Starting proxy: {:?}", proxy_exe);
    println!("[tauri]   WEB_DIR: {:?}", web_dir);

    // Redirect proxy stdout/stderr to log file for debugging
    let log_path = data_dir.join("proxy.log");
    let log_file = std::fs::File::create(&log_path).ok();
    let err_file = std::fs::File::create(data_dir.join("proxy-err.log")).ok();

    let mut cmd = Command::new(&proxy_exe);
    cmd.env("PROXY_PORT", "3001")
        .env("WEB_DIR", &path_str(&web_dir))
        .env("LOMO_BACKEND_URL", "http://localhost:8000");

    if let Some(f) = log_file {
        cmd.stdout(f);
    }
    if let Some(f) = err_file {
        cmd.stderr(f);
    }

    match cmd.spawn() {
        Ok(child) => {
            println!("[tauri] proxy started (pid {})", child.id());
            Some(child)
        }
        Err(e) => {
            eprintln!("[tauri] Failed to start proxy: {}", e);
            None
        }
    }
}

fn kill_processes(state: &mut AppState) {
    if let Some(ref mut p) = state.lomod_process {
        println!("[tauri] Killing lomod (pid {})", p.id());
        p.kill().ok();
        p.wait().ok();
    }
    if let Some(ref mut p) = state.proxy_process {
        println!("[tauri] Killing proxy (pid {})", p.id());
        p.kill().ok();
        p.wait().ok();
    }
    state.lomod_process = None;
    state.proxy_process = None;
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let resource_dir = app
                .path()
                .resource_dir()
                .expect("Failed to get resource dir");
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");

            std::fs::create_dir_all(&data_dir).ok();

            println!("[tauri] Resource dir: {:?}", resource_dir);
            println!("[tauri] Data dir: {:?}", data_dir);

            // Write debug log to data_dir for troubleshooting
            let log_path = data_dir.join("tauri-debug.log");
            let clean_resource = clean_path(&resource_dir);
            let clean_data = clean_path(&data_dir);
            let web_path = clean_data.join("web");
            let proxy_path = clean_resource.join("proxy.exe");
            let log_content = format!(
                "resource_dir (raw): {:?}\nresource_dir (clean): {:?}\ndata_dir: {:?}\nweb_dir: {:?}\nweb_dir exists: {}\nproxy.exe exists: {}\nindex.html exists: {}\n",
                resource_dir,
                clean_resource,
                clean_data,
                web_path,
                web_path.exists(),
                proxy_path.exists(),
                web_path.join("index.html").exists(),
            );
            std::fs::write(&log_path, &log_content).ok();
            println!("[tauri] Debug log written to {:?}", log_path);

            // Extract web.zip to data_dir/web (preserves directory structure)
            let web_dir = extract_web_zip(&resource_dir, &data_dir);

            let lomod = start_lomod(&resource_dir, &data_dir);
            let proxy = start_proxy(&resource_dir, &data_dir);

            // Give the proxy a moment to start before WebView loads
            std::thread::sleep(std::time::Duration::from_secs(2));

            app.manage(Mutex::new(AppState {
                lomod_process: lomod,
                proxy_process: proxy,
            }));

            // Open DevTools for debugging
            if let Some(w) = app.get_webview_window("main") {
                w.open_devtools();
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window
                    .app_handle()
                    .try_state::<Mutex<AppState>>()
                {
                    let mut state = state.lock().unwrap();
                    kill_processes(&mut state);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}
