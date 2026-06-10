pub mod events;
mod ipc;
pub mod security;
pub mod store;

pub fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![
            ipc::app_info,
            ipc::list_agents,
            ipc::create_agent,
            ipc::update_agent,
            ipc::delete_agent,
            ipc::list_projects,
            ipc::create_project,
            ipc::update_project,
            ipc::delete_project,
            ipc::list_rooms,
            ipc::create_room,
            ipc::update_room,
            ipc::delete_room,
            ipc::list_tasks,
            ipc::create_task,
            ipc::update_task,
            ipc::delete_task,
            ipc::get_setting,
            ipc::set_setting,
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
