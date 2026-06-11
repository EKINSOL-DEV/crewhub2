pub mod engine;
pub mod events;
pub mod hooks;
mod ipc;
pub mod security;
pub mod store;

pub fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![
            ipc::app_info::<tauri::Wry>,
            ipc::list_all_sessions,
            ipc::list_archived_sessions,
            ipc::search_transcripts,
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
        .events(tauri_specta::collect_events![
            events::DomainEvent,
            events::EngineEvent
        ])
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

            let claude_config = engine::claude::ClaudeConfig::default();
            app.manage(claude_config.clone());
            let registry = tauri::async_runtime::block_on(async {
                let mut registry = engine::provider::ProviderRegistry::default();
                match engine::claude::ClaudeCodeProvider::start(claude_config) {
                    Ok(provider) => registry.register(std::sync::Arc::new(provider)),
                    Err(e) => eprintln!("claude-code provider failed to start: {e}"),
                }
                std::sync::Arc::new(registry)
            });
            app.manage(registry.clone());

            // T12: periodic idle sweep + auto-spawn of flagged agents.
            let sweep_registry = registry.clone();
            let store_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use tauri::Manager;
                // auto-spawn once at startup
                if let Some(provider) = sweep_registry.get(engine::claude::PROVIDER_ID) {
                    let agents = store_handle
                        .state::<store::Store>()
                        .list_agents()
                        .unwrap_or_default();
                    for agent in agents.into_iter().filter(|a| a.auto_spawn) {
                        if let Some(path) = agent.project_path.clone() {
                            let spec = engine::types::SpawnSpec {
                                project_path: path,
                                prompt: None,
                                model: agent.default_model.clone(),
                                permission_mode: engine::types::PermissionMode::Default,
                                resume_session: None,
                                fork: false,
                                append_system_prompt: agent.system_prompt.clone(),
                                agent_id: Some(agent.id.clone()),
                            };
                            if let Err(e) = provider.spawn(spec).await {
                                eprintln!("auto-spawn failed for {}: {e}", agent.name);
                            }
                        }
                    }
                }
            });

            builder.mount_events(app);

            // Bridge: engine fan-in -> typed webview event.
            let handle = app.handle().clone();
            let mut rx = registry.aggregate_events();
            tauri::async_runtime::spawn(async move {
                use tauri_specta::Event;
                loop {
                    match rx.recv().await {
                        Ok(ev) => {
                            let _ = events::EngineEvent(ev).emit(&handle);
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                    }
                }
            });
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
