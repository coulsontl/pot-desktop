// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backup;
mod clipboard;
mod cmd;
mod config;
mod error;
mod hotkey;
mod lang_detect;
mod screenshot;
mod server;
mod system_ocr;
mod tray;
mod updater;
mod window;

use backup::*;
use clipboard::*;
use cmd::*;
use config::*;
use hotkey::*;
use lang_detect::*;
use log::info;
use once_cell::sync::OnceCell;
use screenshot::screenshot;
use server::*;
use std::sync::Mutex;
use system_ocr::*;
use tauri::api::notification::Notification;
use tauri::Manager;
use tauri_plugin_log::LogTarget;
use tray::*;
use updater::check_update;
use window::config_window;
use window::updater_window;

// Global AppHandle
pub static APP: OnceCell<tauri::AppHandle> = OnceCell::new();

// Text to be translated
pub struct StringWrapper(pub Mutex<String>);

fn main() {
    // tauri-plugin-single-instance v1 dereferences a null pointer in its
    // window proc (see plugins/single-instance/src/platform_impl/windows.rs,
    // `single_instance_window_proc`): CreateWindowExW dispatches WM_NCCREATE
    // before GWL_USERDATA is set, so the very first message reads a null
    // pointer. It only crashes in debug builds, and disabling the plugin there
    // let several Pot instances run at once — each with its own windows.
    // On Windows, take the mutex directly instead.
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS};
        use windows::Win32::System::Threading::CreateMutexW;
        use windows::core::HSTRING;

        let mutex_name = HSTRING::from("Local\\com.pot-app.desktop.single-instance");
        let handle = unsafe { CreateMutexW(None, true, &mutex_name) }
            .expect("failed to create the single-instance mutex");
        let already_running = unsafe { GetLastError() } == ERROR_ALREADY_EXISTS;
        if already_running {
            // Another Pot owns the mutex; leave without touching any state.
            unsafe {
                let _ = CloseHandle(handle);
            }
            std::process::exit(0);
        }
    }
    // `mut` is only needed where the single-instance plugin is registered.
    #[cfg_attr(windows, allow(unused_mut))]
    let mut builder = tauri::Builder::default();
    // Non-Windows still uses the plugin, where it does not have this bug.
    #[cfg(not(windows))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, cwd| {
            Notification::new(&app.config().tauri.bundle.identifier)
                .title("The program is already running. Please do not start it again!")
                .body(cwd)
                .icon("pot")
                .show()
                .unwrap();
        }));
    }
    builder
        .plugin(
            tauri_plugin_log::Builder::default()
                .targets([LogTarget::LogDir, LogTarget::Stdout])
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_fs_watch::init())
        .system_tray(tauri::SystemTray::new())
        .setup(|app| {
            info!("============== Start App ==============");
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                let trusted =
                    macos_accessibility_client::accessibility::application_is_trusted_with_prompt();
                info!("MacOS Accessibility Trusted: {}", trusted);
            }
            // Global AppHandle
            APP.get_or_init(|| app.handle());
            // Init Config
            info!("Init Config Store");
            init_config(app);
            // Check First Run
            if is_first_run() {
                // Open Config Window
                info!("First Run, opening config window");
                config_window();
            }
            app.manage(StringWrapper(Mutex::new("".to_string())));
            // Update Tray Menu
            update_tray(app.app_handle(), "".to_string(), "".to_string());
            // Start http server
            start_server();
            // Register Global Shortcut
            match register_shortcut("all") {
                Ok(()) => {}
                Err(e) => Notification::new(app.config().tauri.bundle.identifier.clone())
                    .title("Failed to register global shortcut")
                    .body(&e)
                    .icon("pot")
                    .show()
                    .unwrap(),
            }
            match get("proxy_enable") {
                Some(v) => {
                    if v.as_bool().unwrap() && get("proxy_host").map_or(false, |host| !host.as_str().unwrap().is_empty()) {
                        let _ = set_proxy();
                    }
                }
                None => {}
            }
            // Check Update
            check_update(app.handle());
            if let Some(engine) = get("translate_detect_engine") {
                if engine.as_str().unwrap() == "local" {
                    init_lang_detect();
                }
            }
            let clipboard_monitor = match get("clipboard_monitor") {
                Some(v) => v.as_bool().unwrap(),
                None => {
                    set("clipboard_monitor", false);
                    false
                }
            };
            app.manage(ClipboardMonitorEnableWrapper(Mutex::new(
                clipboard_monitor.to_string(),
            )));
            start_clipboard_monitor(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            reload_store,
            get_text,
            cut_image,
            get_base64,
            copy_img,
            system_ocr,
            set_proxy,
            unset_proxy,
            run_binary,
            open_devtools,
            register_shortcut_by_frontend,
            update_tray,
            updater_window,
            screenshot,
            lang_detect,
            webdav,
            local,
            install_plugin,
            font_list,
            system_tts,
            aliyun
        ])
        .on_system_tray_event(tray_event_handler)
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        // 窗口关闭不退出
        .run(|_app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}
