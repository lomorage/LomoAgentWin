// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{params, Connection};
use std::io::{self, Read as _};
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

#[derive(serde::Serialize, serde::Deserialize, Clone, Default)]
struct AppConfig {
    #[serde(default)]
    photos_dir: String,
    #[serde(default)]
    setup_completed: bool,
}

struct AppState {
    lomod_process: Option<Child>,
    proxy_process: Option<Child>,
    resource_dir: PathBuf,
    data_dir: PathBuf,
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

fn config_path(data_dir: &std::path::Path) -> PathBuf {
    data_dir.join("config.json")
}

fn assets_db_path(data_dir: &std::path::Path) -> PathBuf {
    data_dir.join("data").join("var").join("assets.db")
}

fn load_config(data_dir: &std::path::Path) -> Option<AppConfig> {
    let path = config_path(data_dir);
    let content = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&content).ok()
}

fn save_config(data_dir: &std::path::Path, config: &AppConfig) -> Result<(), String> {
    let path = config_path(data_dir);
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write {}: {}", path.display(), e))?;
    Ok(())
}

fn default_photos_dir(data_dir: &std::path::Path) -> PathBuf {
    clean_path(&data_dir.join("photos"))
}

fn get_app_config(data_dir: &std::path::Path) -> AppConfig {
    let mut config = load_config(data_dir).unwrap_or_default();
    if config.photos_dir.trim().is_empty() {
        config.photos_dir = path_str(&default_photos_dir(data_dir));
    }
    config
}

fn open_assets_db(data_dir: &std::path::Path) -> Result<Connection, String> {
    let db_path = assets_db_path(data_dir);
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open {}: {}", db_path.display(), e))?;
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| format!("Failed to set SQLite timeout: {}", e))?;
    Ok(conn)
}

fn admin_user_exists(data_dir: &std::path::Path) -> Result<bool, String> {
    let db_path = assets_db_path(data_dir);
    if !db_path.exists() {
        return Ok(false);
    }

    let conn = open_assets_db(data_dir)?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(1) FROM user WHERE user_name = 'admin'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to query admin user: {}", e))?;
    Ok(count > 0)
}

fn is_initial_setup_complete(data_dir: &std::path::Path) -> bool {
    match admin_user_exists(data_dir) {
        Ok(exists) => exists,
        Err(_) => get_app_config(data_dir).setup_completed,
    }
}

fn update_admin_home_dir(
    data_dir: &std::path::Path,
    home_dir: &std::path::Path,
) -> Result<bool, String> {
    let db_path = assets_db_path(data_dir);
    if !db_path.exists() {
        return Ok(false);
    }

    let normalized_home_dir = path_str(home_dir).replace('\\', "/");
    let conn = open_assets_db(data_dir)?;

    let updated = conn
        .execute(
            "UPDATE user SET home_dir = ?1 WHERE user_name = 'admin'",
            params![normalized_home_dir],
        )
        .map_err(|e| format!("Failed to update admin home_dir: {}", e))?;

    if updated == 0 {
        return Ok(false);
    }

    let stored_home_dir: String = conn
        .query_row(
            "SELECT home_dir FROM user WHERE user_name = 'admin'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to verify admin home_dir: {}", e))?;

    if stored_home_dir != normalized_home_dir {
        return Err(format!(
            "admin home_dir verification mismatch: expected {}, found {}",
            normalized_home_dir, stored_home_dir
        ));
    }

    Ok(true)
}

fn get_photos_dir(data_dir: &std::path::Path) -> PathBuf {
    PathBuf::from(get_app_config(data_dir).photos_dir)
}

fn start_lomod(
    resource_dir: &std::path::Path,
    data_dir: &std::path::Path,
    photos_dir: &std::path::Path,
) -> Option<Child> {
    let lomod_dir = clean_path(&resource_dir.join("lomod"));
    let lomod_exe = lomod_dir.join("lomod.exe");

    if !lomod_exe.exists() {
        eprintln!("[tauri] lomod.exe not found at {:?}, skipping", lomod_exe);
        return None;
    }

    let mount_dir = clean_path(photos_dir);
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

    let needs_extract = if marker.exists() && web_dir.join("index.html").exists() {
        let zip_modified = std::fs::metadata(&zip_path)
            .ok()
            .and_then(|m| m.modified().ok());
        let marker_modified = std::fs::metadata(&marker)
            .ok()
            .and_then(|m| m.modified().ok());
        match (zip_modified, marker_modified) {
            (Some(z), Some(m)) => z > m,
            _ => true,
        }
    } else {
        true
    };

    if needs_extract {
        println!("[tauri] Extracting web.zip to {:?}", web_dir);
        if web_dir.exists() {
            std::fs::remove_dir_all(&web_dir).ok();
        }
        std::fs::create_dir_all(&web_dir).ok();

        if let Err(e) = do_extract_zip(&zip_path, &web_dir) {
            eprintln!("[tauri] Failed to extract web.zip: {}", e);
        } else {
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
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
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
    let web_dir = clean_path(&data_dir.join("web"));

    if !proxy_exe.exists() {
        eprintln!("[tauri] proxy.exe not found at {:?}, skipping", proxy_exe);
        return None;
    }

    println!("[tauri] Starting proxy: {:?}", proxy_exe);
    println!("[tauri]   WEB_DIR: {:?}", web_dir);

    let log_path = data_dir.join("proxy.log");
    let log_file = std::fs::File::create(&log_path).ok();
    let err_file = std::fs::File::create(data_dir.join("proxy-err.log")).ok();

    // Extract sharp.zip to data_dir/sharp/node_modules
    let sharp_zip = clean_path(&resource_dir.join("sharp.zip"));
    let sharp_dir = data_dir.join("sharp");
    let sharp_node_modules = clean_path(&sharp_dir.join("node_modules"));
    if sharp_zip.exists() {
        let sharp_marker = sharp_dir.join(".extracted");
        let needs_extract = if sharp_marker.exists() {
            let zip_mod = std::fs::metadata(&sharp_zip)
                .ok()
                .and_then(|m| m.modified().ok());
            let marker_mod = std::fs::metadata(&sharp_marker)
                .ok()
                .and_then(|m| m.modified().ok());
            match (zip_mod, marker_mod) {
                (Some(z), Some(m)) => z > m,
                _ => true,
            }
        } else {
            true
        };
        if needs_extract {
            println!("[tauri] Extracting sharp.zip to {:?}", sharp_dir);
            if sharp_dir.exists() {
                std::fs::remove_dir_all(&sharp_dir).ok();
            }
            std::fs::create_dir_all(&sharp_dir).ok();
            if let Err(e) = do_extract_zip(&sharp_zip, &sharp_dir) {
                eprintln!("[tauri] Failed to extract sharp.zip: {}", e);
            } else {
                std::fs::write(&sharp_marker, "ok").ok();
            }
        }
    }

    let mut cmd = Command::new(&proxy_exe);
    cmd.env("PROXY_PORT", "3001")
        .env("WEB_DIR", &path_str(&web_dir))
        .env("LOMO_BACKEND_URL", "http://localhost:8000")
        .env("NODE_PATH", &path_str(&sharp_node_modules))
        .env("CONFIG_PATH", &path_str(&config_path(data_dir)));

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

fn kill_lomod(state: &mut AppState) {
    if let Some(ref mut p) = state.lomod_process {
        println!("[tauri] Killing lomod (pid {})", p.id());
        p.kill().ok();
        p.wait().ok();
    }
    state.lomod_process = None;
}

fn kill_processes(state: &mut AppState) {
    kill_lomod(state);
    if let Some(ref mut p) = state.proxy_process {
        println!("[tauri] Killing proxy (pid {})", p.id());
        p.kill().ok();
        p.wait().ok();
    }
    state.proxy_process = None;
}

/// Make a simple HTTP POST request using raw TCP (no external deps).
fn http_post(host: &str, port: u16, path: &str, body: &str) -> io::Result<u16> {
    use std::io::Write;
    use std::net::TcpStream;

    let mut stream = TcpStream::connect((host, port))?;
    stream
        .set_read_timeout(Some(std::time::Duration::from_secs(5)))
        .ok();

    let request = format!(
        "POST {} HTTP/1.1\r\nHost: {}:{}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        path, host, port, body.len(), body
    );
    stream.write_all(request.as_bytes())?;

    let mut response = String::new();
    stream.read_to_string(&mut response).ok();

    if let Some(line) = response.lines().next() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            if let Ok(code) = parts[1].parse::<u16>() {
                return Ok(code);
            }
        }
    }
    Ok(0)
}

fn create_admin_user(password: &str, home_dir: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(&home_dir).ok();

    let body = serde_json::json!({
        "Name": "admin",
        "Password": password,
        "HomeDir": path_str(&home_dir).replace('\\', "/"),
    })
    .to_string();

    println!("[tauri] Creating admin user...");

    for attempt in 1..=5 {
        std::thread::sleep(std::time::Duration::from_secs(1));
        match http_post("127.0.0.1", 8000, "/user", &body) {
            Ok(200) | Ok(201) => {
                println!("[tauri] Admin user created successfully");
                return Ok(());
            }
            Ok(code) if code >= 400 => {
                return Err(format!("Failed to create admin user (HTTP {})", code));
            }
            Ok(code) => {
                println!("[tauri] Create admin attempt {}: HTTP {}", attempt, code);
            }
            Err(e) => {
                println!("[tauri] Create admin attempt {}: {}", attempt, e);
            }
        }
    }
    Err("Could not create admin user after 5 attempts".into())
}

// ── Tauri IPC Commands ──────────────────────────────────────────────

#[tauri::command]
fn get_app_settings(state: tauri::State<'_, Mutex<AppState>>) -> Result<serde_json::Value, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let photos_dir = get_photos_dir(&state.data_dir);
    Ok(serde_json::json!({
        "photos_dir": path_str(&photos_dir),
    }))
}

#[tauri::command]
fn get_initial_setup_state(
    state: tauri::State<'_, Mutex<AppState>>,
) -> Result<serde_json::Value, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let photos_dir = get_photos_dir(&state.data_dir);
    Ok(serde_json::json!({
        "setup_required": !is_initial_setup_complete(&state.data_dir),
        "photos_dir": path_str(&photos_dir),
    }))
}

#[tauri::command]
fn pick_folder() -> Result<Option<String>, String> {
    let result = rfd::FileDialog::new()
        .set_title("Choose a folder to store your photos")
        .pick_folder();
    Ok(result.map(|p| path_str(&p)))
}

#[tauri::command]
fn complete_initial_setup(
    state: tauri::State<'_, Mutex<AppState>>,
    photos_dir: String,
    password: String,
) -> Result<(), String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    let data_dir = state.data_dir.clone();
    let resource_dir = state.resource_dir.clone();

    if is_initial_setup_complete(&data_dir) {
        return Err("Initial setup has already been completed".into());
    }

    let next_dir = photos_dir.trim();
    let next_password = password.trim();
    if next_dir.is_empty() {
        return Err("Photos directory is required".into());
    }
    if next_password.is_empty() {
        return Err("Password is required".into());
    }

    let previous_photos_dir = get_photos_dir(&data_dir);
    let photos_path = PathBuf::from(next_dir);
    std::fs::create_dir_all(&photos_path)
        .map_err(|e| format!("Failed to create directory: {}", e))?;
    let home_dir = clean_path(&photos_path.join("admin"));
    std::fs::create_dir_all(&home_dir)
        .map_err(|e| format!("Failed to create admin directory: {}", e))?;

    kill_lomod(&mut state);
    state.lomod_process = start_lomod(&resource_dir, &data_dir, &photos_path);

    if state.lomod_process.is_none() {
        state.lomod_process = start_lomod(&resource_dir, &data_dir, &previous_photos_dir);
        return Err("Failed to restart the Lomo backend".into());
    }

    if let Err(error) = create_admin_user(next_password, &home_dir) {
        kill_lomod(&mut state);
        state.lomod_process = start_lomod(&resource_dir, &data_dir, &previous_photos_dir);
        return Err(error);
    }

    let config = AppConfig {
        photos_dir: path_str(&photos_path),
        setup_completed: true,
    };
    save_config(&data_dir, &config)?;
    println!(
        "[tauri] Initial setup completed: photos_dir={}",
        config.photos_dir
    );
    Ok(())
}

#[tauri::command]
fn save_app_settings(
    state: tauri::State<'_, Mutex<AppState>>,
    photos_dir: String,
) -> Result<(), String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    let data_dir = state.data_dir.clone();
    let resource_dir = state.resource_dir.clone();
    let previous_photos_dir = get_photos_dir(&data_dir);

    let photos_path = PathBuf::from(&photos_dir);
    std::fs::create_dir_all(&photos_path)
        .map_err(|e| format!("Failed to create directory: {}", e))?;
    let home_dir = clean_path(&photos_path.join("admin"));
    std::fs::create_dir_all(&home_dir)
        .map_err(|e| format!("Failed to create admin directory: {}", e))?;

    // Kill current lomod
    kill_lomod(&mut state);

    let admin_home_dir_updated = match update_admin_home_dir(&data_dir, &home_dir) {
        Ok(updated) => updated,
        Err(error) => {
            state.lomod_process = start_lomod(&resource_dir, &data_dir, &previous_photos_dir);
            return Err(error);
        }
    };

    if !admin_home_dir_updated {
        state.lomod_process = start_lomod(&resource_dir, &data_dir, &previous_photos_dir);
        return Err(
            "Admin user not found. Complete setup before changing the storage folder.".into(),
        );
    }

    // Save config after the local database update succeeds.
    let mut config = get_app_config(&data_dir);
    config.photos_dir = photos_dir.clone();
    config.setup_completed = true;
    save_config(&data_dir, &config)?;
    println!("[tauri] Settings saved: photos_dir={}", photos_dir);

    // Start new lomod with updated mount-dir
    state.lomod_process = start_lomod(&resource_dir, &data_dir, &photos_path);
    println!("[tauri] Admin user HomeDir updated in local database");

    println!(
        "[tauri] lomod restarted with new photos dir: {}",
        photos_dir
    );
    Ok(())
}

// ── Main ────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_app_settings,
            get_initial_setup_state,
            pick_folder,
            complete_initial_setup,
            save_app_settings,
        ])
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

            // Write debug log
            let log_path = data_dir.join("tauri-debug.log");
            let clean_resource = clean_path(&resource_dir);
            let clean_data = clean_path(&data_dir);
            let web_path = clean_data.join("web");
            let proxy_path = clean_resource.join("proxy.exe");
            let log_content = format!(
                "resource_dir (raw): {:?}\nresource_dir (clean): {:?}\ndata_dir: {:?}\nweb_dir: {:?}\nweb_dir exists: {}\nproxy.exe exists: {}\nindex.html exists: {}\n",
                resource_dir, clean_resource, clean_data, web_path,
                web_path.exists(), proxy_path.exists(), web_path.join("index.html").exists(),
            );
            std::fs::write(&log_path, &log_content).ok();
            println!("[tauri] Debug log written to {:?}", log_path);

            // Determine photos directory from config or use default (no dialog)
            let photos_dir = get_photos_dir(&data_dir);
            std::fs::create_dir_all(&photos_dir).ok();
            println!("[tauri] Photos dir: {:?}", photos_dir);

            // Extract web.zip
            let _web_dir = extract_web_zip(&resource_dir, &data_dir);

            // Start lomod
            let lomod = start_lomod(&resource_dir, &data_dir, &photos_dir);

            // Start proxy
            let proxy = start_proxy(&resource_dir, &data_dir);

            // Give the proxy a moment to start before WebView loads
            std::thread::sleep(std::time::Duration::from_secs(2));

            app.manage(Mutex::new(AppState {
                lomod_process: lomod,
                proxy_process: proxy,
                resource_dir: clean_path(&resource_dir),
                data_dir: clean_path(&data_dir),
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
