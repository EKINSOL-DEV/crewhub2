pub mod engine;
pub mod events;
pub mod git;
pub mod hooks;
pub mod import;
mod ipc;
pub mod mcp;
pub mod onboarding;
pub mod orchestrator;
pub mod security;
pub mod store;
pub mod workspace;

pub fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![
            ipc::app_info::<tauri::Wry>,
            ipc::list_all_sessions,
            ipc::provider_caps,
            ipc::spawn_session,
            ipc::send_to_session,
            ipc::respond_to_permission,
            ipc::answer_question,
            ipc::interrupt_session,
            ipc::kill_session,
            ipc::list_permission_rules,
            ipc::add_permission_rule::<tauri::Wry>,
            ipc::revoke_permission_rule::<tauri::Wry>,
            ipc::get_session_transcript,
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
            ipc::list_room_rules,
            ipc::create_room_rule::<tauri::Wry>,
            ipc::update_room_rule::<tauri::Wry>,
            ipc::delete_room_rule::<tauri::Wry>,
            ipc::list_tasks,
            ipc::get_task,
            ipc::create_task::<tauri::Wry>,
            ipc::update_task::<tauri::Wry>,
            ipc::delete_task::<tauri::Wry>,
            ipc::list_task_events,
            ipc::record_task_run_started::<tauri::Wry>,
            ipc::record_task_run_finished::<tauri::Wry>,
            ipc::list_session_bindings,
            ipc::upsert_session_binding::<tauri::Wry>,
            ipc::delete_session_binding::<tauri::Wry>,
            ipc::handoff,
            ipc::handoff_targets,
            ipc::pick_folder::<tauri::Wry>,
            ipc::list_doc_tree,
            ipc::read_doc_file,
            ipc::read_doc_image,
            ipc::git_status,
            ipc::git_diff,
            ipc::git_default_base,
            ipc::list_slash_commands,
            ipc::materialize_persona,
            ipc::remove_materialized_persona,
            ipc::list_notification_rules,
            ipc::create_notification_rule::<tauri::Wry>,
            ipc::update_notification_rule::<tauri::Wry>,
            ipc::delete_notification_rule::<tauri::Wry>,
            ipc::get_setting,
            ipc::set_setting::<tauri::Wry>,
            ipc::open_settings_window::<tauri::Wry>,
            ipc::mcp_status,
            ipc::enable_mcp_for_project,
            ipc::disable_mcp_for_project,
            ipc::list_meetings,
            ipc::get_meeting,
            ipc::list_meeting_turns,
            ipc::list_action_items,
            ipc::start_meeting,
            ipc::cancel_meeting,
            ipc::convert_action_item::<tauri::Wry>,
            ipc::run_standup,
            ipc::list_standups,
            ipc::get_standup,
            ipc::list_standup_entries,
            ipc::list_runs,
            ipc::get_run,
            ipc::create_run::<tauri::Wry>,
            ipc::update_run::<tauri::Wry>,
            ipc::delete_run::<tauri::Wry>,
            ipc::set_run_enabled::<tauri::Wry>,
            ipc::run_now,
            ipc::list_run_results,
            ipc::preview_cron,
            ipc::list_prompt_templates,
            ipc::create_prompt_template::<tauri::Wry>,
            ipc::update_prompt_template::<tauri::Wry>,
            ipc::delete_prompt_template::<tauri::Wry>,
            ipc::hooks_status,
            ipc::preview_hooks_install,
            ipc::install_hooks,
            ipc::uninstall_hooks,
            ipc::detect_environment,
            ipc::set_cli_path,
            ipc::scan_recent_projects,
            ipc::create_sample_crew::<tauri::Wry>,
            ipc::preview_v1_import,
            ipc::run_v1_import::<tauri::Wry>,
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
        // Clipboard: webview gets write-text only (capabilities/main.json) for
        // the handoff "copy path" / "copy resume command" actions (EKI-80).
        .plugin(tauri_plugin_clipboard_manager::init())
        // Dialog: folder picker invoked Rust-side only via `pick_folder`
        // (D-M3-7) — the webview gets NO dialog:* permission.
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            use tauri::Manager;
            let db_path = app
                .path()
                .app_data_dir()
                .expect("app data dir")
                .join("crewhub.db");
            let store = std::sync::Arc::new(store::Store::open(&db_path).expect("open store"));
            app.manage(store.clone());

            // M6 T2 (D-M6-2): existing installs never see the wizard.
            if let Err(e) = onboarding::mark_existing_install_done(&store) {
                eprintln!("onboarding fresh-install check failed: {e}");
            }

            // M6 T2 (G2): no persisted CLI path yet — best-effort probe so a
            // non-PATH install works even before the wizard's detect step.
            if store
                .get_setting(engine::claude::detect::CLI_PATH_SETTING)
                .ok()
                .flatten()
                .is_none()
            {
                if let Some(found) = engine::claude::detect::find_cli(
                    std::env::var_os("PATH").as_deref(),
                    &dirs::home_dir().unwrap_or_default(),
                ) {
                    let _ = store.set_setting(
                        engine::claude::detect::CLI_PATH_SETTING,
                        &found.display().to_string(),
                    );
                }
            }
            let claude_config = engine::claude::ClaudeConfig::from_settings(&store);
            let provider_store = store.clone();
            let registry = tauri::async_runtime::block_on(async {
                let mut registry = engine::provider::ProviderRegistry::default();
                match engine::claude::ClaudeCodeProvider::start(claude_config, provider_store) {
                    Ok(provider) => registry.register(std::sync::Arc::new(provider)),
                    Err(e) => eprintln!("claude-code provider failed to start: {e}"),
                }
                std::sync::Arc::new(registry)
            });
            app.manage(registry.clone());

            // M6 T1 (D-M6-1/G1): boot the hooks UDS receiver. Signals flow
            // into the registry fan-in (same stream as provider events);
            // SessionStart gets the store-backed context envelope reply.
            // Windows: skipped — UDS only; the app runs watcher-only there.
            #[cfg(unix)]
            {
                let context_store = store.clone();
                let context: hooks::receiver::ContextProvider = std::sync::Arc::new(move |cwd| {
                    hooks::context::build_envelope(&context_store, cwd, None)
                });
                let receiver = tauri::async_runtime::block_on(async {
                    hooks::receiver::HookReceiver::start_with_context(
                        hooks::receiver::ReceiverConfig {
                            socket_path: hooks::signal_socket_path(),
                            ..Default::default()
                        },
                        registry.event_sender(),
                        Some(context),
                    )
                });
                match receiver {
                    // keep it alive for the app's lifetime (Drop unbinds)
                    Ok(receiver) => app.manage(receiver),
                    Err(e) => {
                        eprintln!("hooks receiver failed to start: {e}");
                        true
                    }
                };
            }

            // G4: the persisted "allow always" rules apply from the first spawn.
            let initial_rules = store
                .get_setting(engine::rules::SETTINGS_KEY)
                .ok()
                .flatten()
                .map(|json| engine::rules::PermissionRules::from_json(&json))
                .unwrap_or_default();
            registry.push_permission_rules(&initial_rules);

            // T12: periodic idle sweep + auto-spawn of flagged agents.
            let sweep_registry = registry.clone();
            let store_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use tauri::Manager;
                // auto-spawn once at startup
                if let Some(provider) = sweep_registry.get(engine::claude::PROVIDER_ID) {
                    let agents = store_handle
                        .state::<std::sync::Arc<store::Store>>()
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

            // T20/T23: MCP server — single loopback socket, per-launch token.
            // Tool-driven store mutations broadcast DomainEvents on `mcp_notify`
            // (they bypass the IPC emit path); bridged to the webview below.
            // The M4 orchestrator shares the same backend-events channel.
            let (mcp_notify, _) = tokio::sync::broadcast::channel::<events::DomainEvent>(256);

            // M4: orchestration layer — meetings (T3) + boot recovery scan
            // (D-M4-2: resume non-terminal meetings at their persisted position).
            let orchestrator = orchestrator::Orchestrator::new(
                store.clone(),
                registry.clone(),
                mcp_notify.clone(),
            );
            app.manage(orchestrator.clone());
            let recover = orchestrator.clone();
            tauri::async_runtime::spawn(async move {
                let resumed = recover.recover_on_boot();
                if resumed > 0 {
                    eprintln!("orchestrator: resumed {resumed} in-flight meeting(s)");
                }
                // 17.1: the owned cron loop (honest scope: runs only while open)
                recover.start_scheduler();
            });
            let mcp_handle = match tauri::async_runtime::block_on(mcp::server::McpServer::start(
                store.clone(),
                mcp_notify.clone(),
            )) {
                Ok(server) => mcp::McpHandle(Some(server)),
                Err(e) => {
                    eprintln!("mcp server failed to start: {e}");
                    mcp::McpHandle(None)
                }
            };
            // Token rotates per launch: refresh registration for enabled projects
            // via whichever provider has the mcp_registration capability.
            if let (Some(server), Some(registrar)) = (&mcp_handle.0, registry.mcp_registrar()) {
                let (port, token) = (server.port(), server.token().to_string());
                let refresh_store = store.clone();
                tauri::async_runtime::spawn(async move {
                    let projects = refresh_store.list_projects().unwrap_or_default();
                    for p in projects {
                        let enabled = refresh_store
                            .get_setting(&mcp::enabled_setting_key(&p.id))
                            .ok()
                            .flatten();
                        if enabled.as_deref() == Some("true") {
                            if let Err(e) = registrar
                                .register_mcp(std::path::Path::new(&p.folder_path), port, &token)
                                .await
                            {
                                eprintln!("mcp registration refresh failed for {}: {e}", p.name);
                            }
                        }
                    }
                });
            }
            app.manage(mcp_handle);

            builder.mount_events(app);

            // Bridge: MCP tool mutations -> typed webview DomainEvent.
            let mcp_event_handle = app.handle().clone();
            let mut mcp_rx = mcp_notify.subscribe();
            tauri::async_runtime::spawn(async move {
                use tauri_specta::Event;
                loop {
                    match mcp_rx.recv().await {
                        Ok(ev) => {
                            let _ = ev.emit(&mcp_event_handle);
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                    }
                }
            });

            // Bridge: engine fan-in -> typed webview event. Discovery also
            // feeds the room-rule auto-assign evaluator (M3 T2, D-M3-10):
            // a binding is written only when no row exists for the session,
            // so manual overrides stick by construction.
            let handle = app.handle().clone();
            let assign_store = store.clone();
            let mut rx = registry.aggregate_events();
            tauri::async_runtime::spawn(async move {
                use tauri_specta::Event;
                loop {
                    match rx.recv().await {
                        Ok(ev) => {
                            if let engine::types::SessionEvent::Discovered { meta }
                            | engine::types::SessionEvent::Updated { meta } = &ev
                            {
                                match store::room_rules::auto_assign_session(
                                    &assign_store,
                                    meta,
                                    None,
                                ) {
                                    Ok(Some(binding)) => {
                                        let _ = events::DomainEvent::SessionBindingChanged {
                                            session_id: binding.session_id,
                                        }
                                        .emit(&handle);
                                    }
                                    Ok(None) => {}
                                    Err(e) => eprintln!("room auto-assign failed: {e}"),
                                }
                            }
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
