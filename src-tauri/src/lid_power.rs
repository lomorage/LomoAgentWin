//! Opt-in "keep backing up with the lid closed": while a phone backup runs on
//! AC power, the plugged-in lid-close action of the active power scheme is
//! switched to "Do nothing", then put back when the backup ends or the PC is
//! unplugged. The original value is written to disk before it is changed, so a
//! crash or forced shutdown is undone on the next launch.
//!
//! Uses powrprof.dll directly — `powercfg` output is localized and can't be
//! parsed reliably. Changing the current user's active scheme needs no admin.

use std::path::{Path, PathBuf};

const RESTORE_FILE: &str = "lid-action-restore.json";

#[derive(serde::Serialize, serde::Deserialize)]
struct SavedLidAction {
    scheme: win::Guid,
    ac_value: u32,
}

fn restore_path(data_dir: &Path) -> PathBuf {
    data_dir.join(RESTORE_FILE)
}

/// Sets the plugged-in lid action to "Do nothing". Returns false if it failed.
pub fn override_lid_action(data_dir: &Path) -> bool {
    if restore_path(data_dir).exists() {
        return true;
    }
    let Some(scheme) = win::active_scheme() else {
        return false;
    };
    let Some(ac_value) = win::read_lid_ac(&scheme) else {
        return false;
    };
    if ac_value == win::LID_DO_NOTHING {
        // The user already keeps the PC awake with the lid closed.
        return true;
    }

    let saved = SavedLidAction { scheme, ac_value };
    let Ok(json) = serde_json::to_string(&saved) else {
        return false;
    };
    if std::fs::write(restore_path(data_dir), json).is_err() {
        return false;
    }
    if !win::write_lid_ac(&scheme, win::LID_DO_NOTHING) {
        std::fs::remove_file(restore_path(data_dir)).ok();
        return false;
    }
    println!("[tauri] Lid close set to \"Do nothing\" during backup (was {})", ac_value);
    true
}

/// Puts back the lid action saved by `override_lid_action`, if any.
pub fn restore_lid_action(data_dir: &Path) {
    let path = restore_path(data_dir);
    let Ok(json) = std::fs::read_to_string(&path) else {
        return;
    };
    let Ok(saved) = serde_json::from_str::<SavedLidAction>(&json) else {
        std::fs::remove_file(&path).ok();
        return;
    };

    // If the user changed the lid setting themselves meanwhile, keep theirs.
    if win::read_lid_ac(&saved.scheme) == Some(win::LID_DO_NOTHING)
        && !win::write_lid_ac(&saved.scheme, saved.ac_value)
    {
        eprintln!("[tauri] Failed to restore lid close action; will retry next launch");
        return;
    }
    std::fs::remove_file(&path).ok();
    println!("[tauri] Lid close action restored ({})", saved.ac_value);
}

pub fn on_ac_power() -> bool {
    win::on_ac_power()
}

#[cfg(target_os = "windows")]
mod win {
    use std::ffi::c_void;
    use std::ptr::null_mut;

    #[repr(C)]
    #[derive(Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
    pub struct Guid {
        data1: u32,
        data2: u16,
        data3: u16,
        data4: [u8; 8],
    }

    /// SUB_BUTTONS: 4f971e89-eebd-4455-a8de-9e59040e7347
    const SUB_BUTTONS: Guid = Guid {
        data1: 0x4f97_1e89,
        data2: 0xeebd,
        data3: 0x4455,
        data4: [0xa8, 0xde, 0x9e, 0x59, 0x04, 0x0e, 0x73, 0x47],
    };
    /// LIDACTION: 5ca83367-6e45-459f-a27b-476b1d01c936
    const LIDACTION: Guid = Guid {
        data1: 0x5ca8_3367,
        data2: 0x6e45,
        data3: 0x459f,
        data4: [0xa2, 0x7b, 0x47, 0x6b, 0x1d, 0x01, 0xc9, 0x36],
    };
    pub const LID_DO_NOTHING: u32 = 0;

    #[repr(C)]
    struct SystemPowerStatus {
        ac_line_status: u8,
        battery_flag: u8,
        battery_life_percent: u8,
        system_status_flag: u8,
        battery_life_time: u32,
        battery_full_life_time: u32,
    }

    #[link(name = "powrprof")]
    extern "system" {
        fn PowerGetActiveScheme(root: *mut c_void, active: *mut *mut Guid) -> u32;
        fn PowerReadACValueIndex(
            root: *mut c_void,
            scheme: *const Guid,
            subgroup: *const Guid,
            setting: *const Guid,
            value: *mut u32,
        ) -> u32;
        fn PowerWriteACValueIndex(
            root: *mut c_void,
            scheme: *const Guid,
            subgroup: *const Guid,
            setting: *const Guid,
            value: u32,
        ) -> u32;
        fn PowerSetActiveScheme(root: *mut c_void, scheme: *const Guid) -> u32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn LocalFree(mem: *mut c_void) -> *mut c_void;
        fn GetSystemPowerStatus(status: *mut SystemPowerStatus) -> i32;
    }

    pub fn active_scheme() -> Option<Guid> {
        let mut ptr: *mut Guid = null_mut();
        unsafe {
            if PowerGetActiveScheme(null_mut(), &mut ptr) != 0 || ptr.is_null() {
                return None;
            }
            let scheme = *ptr;
            LocalFree(ptr.cast());
            Some(scheme)
        }
    }

    pub fn read_lid_ac(scheme: &Guid) -> Option<u32> {
        let mut value = 0u32;
        let status =
            unsafe { PowerReadACValueIndex(null_mut(), scheme, &SUB_BUTTONS, &LIDACTION, &mut value) };
        (status == 0).then_some(value)
    }

    /// Writes the value and re-applies the scheme if it is the active one.
    pub fn write_lid_ac(scheme: &Guid, value: u32) -> bool {
        unsafe {
            if PowerWriteACValueIndex(null_mut(), scheme, &SUB_BUTTONS, &LIDACTION, value) != 0 {
                return false;
            }
            if active_scheme().as_ref() == Some(scheme) {
                return PowerSetActiveScheme(null_mut(), scheme) == 0;
            }
        }
        true
    }

    pub fn on_ac_power() -> bool {
        let mut status = SystemPowerStatus {
            ac_line_status: 0,
            battery_flag: 0,
            battery_life_percent: 0,
            system_status_flag: 0,
            battery_life_time: 0,
            battery_full_life_time: 0,
        };
        unsafe { GetSystemPowerStatus(&mut status) != 0 && status.ac_line_status == 1 }
    }
}

#[cfg(not(target_os = "windows"))]
mod win {
    #[derive(Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
    pub struct Guid;
    pub const LID_DO_NOTHING: u32 = 0;
    pub fn active_scheme() -> Option<Guid> {
        None
    }
    pub fn read_lid_ac(_scheme: &Guid) -> Option<u32> {
        None
    }
    pub fn write_lid_ac(_scheme: &Guid, _value: u32) -> bool {
        false
    }
    pub fn on_ac_power() -> bool {
        false
    }
}
