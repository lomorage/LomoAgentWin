//! Background watcher for phone backups served by this PC (local mode only).
//!
//! A laptop that sleeps (lid closed, idle timeout) silently pauses any phone
//! backup in progress. This watcher:
//! - shows a tray hint / tooltip that backups pause while the PC sleeps,
//! - keeps the PC from idle-sleeping while a phone is connected,
//! - nudges the user once per run when a phone backup starts,
//! - tells the user after wake-up if the PC slept during a backup.
//!
//! Lid-close and manual sleep can't be prevented by an app, which is why the
//! warnings are still needed alongside the idle-sleep block.

use std::net::IpAddr;
use std::sync::Mutex;
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::{build_tray_menu, AppState, LOMOD_PORT, PROXY_PORT, TRAY_ID};

const POLL_INTERVAL: Duration = Duration::from_secs(10);
/// A wall-clock gap this much longer than `POLL_INTERVAL` means the PC was asleep.
const SLEEP_GAP: Duration = Duration::from_secs(60);
/// Consecutive polls with a phone connected before we treat it as a backup
/// (filters out quick sync checks).
const ACTIVE_POLLS_FOR_BACKUP: u32 = 2;
/// Ports phones use to reach this PC: lomod (Lomorage app) and the proxy (QR web upload).
const PHONE_PORTS: [u16; 2] = [LOMOD_PORT, PROXY_PORT];

pub const SLEEP_HINT: &str = "Backup pauses when this PC sleeps — keep it awake during the first backup";
const TOOLTIP_REMOTE: &str = "lomorage";
const TOOLTIP_LOCAL: &str = "lomorage — backup pauses when this PC sleeps";
const TOOLTIP_BACKING_UP: &str = "lomorage — phone connected, keep this PC awake until backup finishes";

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || run(app));
}

fn run(app: AppHandle) {
    let mut last_local: Option<bool> = None;
    let mut last_tooltip = "";
    let mut active_polls = 0u32;
    let mut nudged = false;
    let mut last_wall = SystemTime::now();

    loop {
        let now = SystemTime::now();
        let elapsed = now.duration_since(last_wall).unwrap_or_default();
        last_wall = now;
        let backing_up_before = active_polls >= ACTIVE_POLLS_FOR_BACKUP;

        if elapsed > POLL_INTERVAL + SLEEP_GAP {
            println!("[tauri] System resumed after ~{}s asleep", elapsed.as_secs());
            if backing_up_before {
                notify(
                    &app,
                    "Backup paused while this PC was asleep",
                    "A phone backup was interrupted when this PC went to sleep. It continues \
                     when the phone reconnects — keep the PC awake and the lid open until large \
                     backups finish.",
                );
            }
            active_polls = 0;
        }

        if let Some(local) = server_is_local(&app) {
            if last_local != Some(local) {
                refresh_tray_menu(&app, local);
                last_local = Some(local);
            }
        }
        let local = last_local.unwrap_or(false);

        let phone_connected = local && phone_connection_count() > 0;
        active_polls = if phone_connected { active_polls.saturating_add(1) } else { 0 };
        let backing_up = active_polls >= ACTIVE_POLLS_FOR_BACKUP;

        if backing_up != backing_up_before {
            set_keep_awake(backing_up);
            println!(
                "[tauri] Phone backup {}; idle sleep {}",
                if backing_up { "detected" } else { "idle" },
                if backing_up { "blocked" } else { "allowed" }
            );
        }
        if backing_up && !nudged {
            nudged = true;
            notify(
                &app,
                "Phone backup in progress",
                "Keep this PC awake and the lid open until the backup finishes — backups pause \
                 while the PC sleeps.",
            );
        }

        let tooltip = if !local {
            TOOLTIP_REMOTE
        } else if backing_up {
            TOOLTIP_BACKING_UP
        } else {
            TOOLTIP_LOCAL
        };
        if tooltip != last_tooltip {
            if let Some(tray) = app.tray_by_id(TRAY_ID) {
                let _ = tray.set_tooltip(Some(tooltip));
            }
            last_tooltip = tooltip;
        }

        std::thread::sleep(POLL_INTERVAL);
    }
}

/// `Some(true)` when this PC runs lomod; `None` if the state is unavailable
/// (startup not finished, or a settings change is holding the lock).
fn server_is_local(app: &AppHandle) -> Option<bool> {
    let state = app.try_state::<Mutex<AppState>>()?;
    let state = state.try_lock().ok()?;
    Some(state.lomod_process.is_some())
}

fn refresh_tray_menu(app: &AppHandle, local: bool) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    match build_tray_menu(app, local) {
        Ok(menu) => {
            let _ = tray.set_menu(Some(menu));
        }
        Err(e) => eprintln!("[tauri] Failed to rebuild tray menu: {}", e),
    }
}

fn notify(app: &AppHandle, title: &str, body: &str) {
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        eprintln!("[tauri] Failed to show notification: {}", e);
    }
}

/// Blocks idle sleep while `on`. Execution state is per-thread, so this must be
/// called from the long-lived watcher thread.
#[cfg(target_os = "windows")]
fn set_keep_awake(on: bool) {
    const ES_CONTINUOUS: u32 = 0x8000_0000;
    const ES_SYSTEM_REQUIRED: u32 = 0x0000_0001;

    #[link(name = "kernel32")]
    extern "system" {
        fn SetThreadExecutionState(flags: u32) -> u32;
    }

    let flags = if on {
        ES_CONTINUOUS | ES_SYSTEM_REQUIRED
    } else {
        ES_CONTINUOUS
    };
    unsafe {
        SetThreadExecutionState(flags);
    }
}

#[cfg(not(target_os = "windows"))]
fn set_keep_awake(_on: bool) {}

/// Established TCP connections from other machines to the ports phones use.
#[cfg(target_os = "windows")]
fn phone_connection_count() -> usize {
    let Ok(output) = crate::hidden_command("netstat").arg("-ano").output() else {
        return 0;
    };
    count_phone_connections(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(not(target_os = "windows"))]
fn phone_connection_count() -> usize {
    0
}

fn count_phone_connections(netstat: &str) -> usize {
    netstat
        .lines()
        .filter(|line| {
            let columns: Vec<&str> = line.split_whitespace().collect();
            if columns.len() < 5
                || !columns[0].to_ascii_uppercase().starts_with("TCP")
                || !columns[3].eq_ignore_ascii_case("ESTABLISHED")
            {
                return false;
            }
            let (Some((local_ip, local_port)), Some((remote_ip, _))) =
                (split_endpoint(columns[1]), split_endpoint(columns[2]))
            else {
                return false;
            };
            PHONE_PORTS.contains(&local_port) && !remote_ip.is_loopback() && remote_ip != local_ip
        })
        .count()
}

/// Parses netstat endpoints like `192.168.1.5:8000` or `[fe80::1%12]:8000`.
fn split_endpoint(endpoint: &str) -> Option<(IpAddr, u16)> {
    let (host, port) = endpoint.rsplit_once(':')?;
    let host = host.trim_start_matches('[').trim_end_matches(']');
    let host = host.split('%').next()?;
    let ip: IpAddr = host.parse().ok()?;
    Some((ip.to_canonical(), port.parse().ok()?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_only_lan_connections_to_phone_ports() {
        let netstat = "
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:8000           0.0.0.0:0              LISTENING       100
  TCP    127.0.0.1:8000         127.0.0.1:50100        ESTABLISHED     100
  TCP    192.168.1.5:8000       192.168.1.20:53422     ESTABLISHED     100
  TCP    192.168.1.5:3001       192.168.1.21:53423     ESTABLISHED     200
  TCP    192.168.1.5:3001       192.168.1.5:53424      ESTABLISHED     200
  TCP    192.168.1.5:8000       192.168.1.22:53425     TIME_WAIT       0
  TCP    192.168.1.5:50200      140.82.112.3:443       ESTABLISHED     300
  TCP    [::1]:8000             [::1]:50101            ESTABLISHED     100
  TCP    [::ffff:192.168.1.5]:8000  [::ffff:127.0.0.1]:50102  ESTABLISHED  100
  TCP    [fe80::1%12]:8000      [fe80::2%12]:50103     ESTABLISHED     100
  UDP    0.0.0.0:5353           *:*                                    400
";
        assert_eq!(count_phone_connections(netstat), 3);
    }
}
