pub mod events;
mod ipc;
pub mod security;
pub mod store;

pub fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![
            ipc::app_info::<tauri::Wry>,
            ipc::list_agents,
            ipc::create_agent::<tauri::Wry>,
            ipc::update_agent::<tauri::Wry>,
            ipc::delete_agent::<tauri::Wry>,
            ipc::list_projects,
            ipc::create_project::<tauri::Wry>,
            ipc::update_project::<tauri::Wry>,
            ipc::delete_project::<tauri::Wry>,
            ipc::list_rooms,
            ipc::create_room::<tauri::Wry>,
            ipc::update_room::<tauri::Wry>,
            ipc::delete_room::<tauri::Wry>,
            ipc::list_tasks,
            ipc::create_task::<tauri::Wry>,
            ipc::update_task::<tauri::Wry>,
            ipc::delete_task::<tauri::Wry>,
            ipc::get_setting,
            ipc::set_setting::<tauri::Wry>,
        ])
        .events(tauri_specta::collect_events![events::DomainEvent])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = specta_builder();

    #[cfg(debug_assertions)]
    builder
        .export(
            specta_typescript::Typescript::default(),
            "../src/ipc/bindings.ts",
        )
        .expect("failed to export typescript bindings");

    tauri::Builder::default()
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            use tauri::Manager;
            let db_path = app
                .path()
                .app_data_dir()
                .expect("app data dir")
                .join("crewhub.db");
            let store = store::Store::open(&db_path).expect("open store");
            app.manage(store);
            builder.mount_events(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    #[test]
    fn export_bindings() {
        super::specta_builder()
            .export(
                specta_typescript::Typescript::default(),
                "../src/ipc/bindings.ts",
            )
            .expect("export failed");
    }
}
