use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg(target_os = "windows")]
fn apply_acrylic_win11(window: &tauri::WebviewWindow) -> Result<(), windows::core::Error> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{
        DwmExtendFrameIntoClientArea, DwmSetWindowAttribute, DWMSBT_TRANSIENTWINDOW,
        DWMWA_SYSTEMBACKDROP_TYPE, DWM_SYSTEMBACKDROP_TYPE,
    };
    use windows::Win32::UI::Controls::MARGINS;

    let raw_hwnd = window.hwnd().expect("Failed to get HWND");
    let hwnd = HWND(raw_hwnd.0 as *mut _);

    unsafe {
        let margins = MARGINS {
            cxLeftWidth: 0, cxRightWidth: 0,
            cyTopHeight: 0, cyBottomHeight: 1,
        };
        let _ = DwmExtendFrameIntoClientArea(hwnd, &margins);

        let backdrop_type: DWM_SYSTEMBACKDROP_TYPE = DWMSBT_TRANSIENTWINDOW;
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_SYSTEMBACKDROP_TYPE,
            &backdrop_type as *const _ as *const _,
            std::mem::size_of::<DWM_SYSTEMBACKDROP_TYPE>() as u32,
        )
    }
}

#[cfg(target_os = "windows")]
fn apply_acrylic_win10(window: &tauri::WebviewWindow) {
    use std::ffi::c_void;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryA};
    use windows::Win32::UI::WindowsAndMessaging::{GetWindowLongPtrW, SetWindowLongPtrW, GWL_STYLE, WS_BORDER};
    #[cfg(target_arch = "x86")]
    use windows::Win32::UI::WindowsAndMessaging::{GetWindowLongW, SetWindowLongW};
    use windows::core::s;

    let raw_hwnd = window.hwnd().expect("Failed to get HWND");
    let hwnd = HWND(raw_hwnd.0 as *mut _);

    unsafe {
        // 尝试移除 WS_BORDER 样式
        #[cfg(target_arch = "x86_64")]
        {
            let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
            SetWindowLongPtrW(hwnd, GWL_STYLE, (style & !WS_BORDER.0) as isize);
        }
        #[cfg(target_arch = "x86")]
        {
            let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
            SetWindowLongW(hwnd, GWL_STYLE, (style & !WS_BORDER.0) as i32);
        }

        #[repr(C)]
        struct ACCENT_POLICY {
            accent_state: u32,
            accent_flags: u32,
            gradient_color: u32,
            animation_id: u32,
        }

        #[repr(C)]
        struct WINDOWCOMPOSITIONATTRIBDATA {
            attrib: u32,
            pv_data: *mut c_void,
            cb_data: usize,
        }

        const WCA_ACCENT_POLICY: u32 = 19;
        const ACCENT_ENABLE_ACRYLICBLURBEHIND: u32 = 4;
        
        if let Ok(user32) = LoadLibraryA(s!("user32.dll")) {
            if let Some(proc) = GetProcAddress(user32, s!("SetWindowCompositionAttribute")) {
                let set_window_composition_attribute: extern "system" fn(HWND, *mut WINDOWCOMPOSITIONATTRIBDATA) -> i32 = std::mem::transmute(proc);
                
                let mut policy = ACCENT_POLICY {
                    accent_state: ACCENT_ENABLE_ACRYLICBLURBEHIND,
                    accent_flags: 2,
                    gradient_color: 0x01000000, 
                    animation_id: 0,
                };

                let mut data = WINDOWCOMPOSITIONATTRIBDATA {
                    attrib: WCA_ACCENT_POLICY,
                    pv_data: &mut policy as *mut _ as *mut c_void,
                    cb_data: std::mem::size_of_val(&policy),
                };

                set_window_composition_attribute(hwnd, &mut data);
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {

            #[cfg(not(debug_assertions))]
            {
                let (mut rx, _child) = app.shell()
                .sidecar("wuwachat-server")
                .unwrap()
                .spawn()
                .expect("Failed to spawn sidecar");

                tauri::async_runtime::spawn(async move {
                    while let Some(event) = rx.recv().await {
                        if let CommandEvent::Stdout(line) = event {
                            println!("Server: {:?}", String::from_utf8_lossy(&line));
                        }
                    }
                });
            }

            #[cfg(target_os = "windows")]
            {
                let window = app
                    .get_webview_window("main")
                    .expect("Failed to get main window");
                
                if apply_acrylic_win11(&window).is_err() {
                    apply_acrylic_win10(&window);

                    // 修复 Win10 亚克力 API 的 Bug：从最小化恢复时强制再次剔除原生标题栏
                    let win_clone = window.clone();
                    window.on_window_event(move |event| {
                        match event {
                            tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Focused(true) => {
                                let _ = win_clone.set_decorations(false);
                            }
                            _ => {}
                        }
                    });
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
