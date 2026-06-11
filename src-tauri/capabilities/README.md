# Capability register

Every permission granted to a window MUST be listed here with a one-line justification.
PR reviewers: reject any capability change that does not update this file.

| Capability file | Window   | Permission                         | Why                                                                                                                                                                                                            |
| --------------- | -------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| main.json       | main     | core:default                       | Event emit/listen for typed IPC events; window basics; app metadata for About.                                                                                                                                 |
| main.json       | main     | clipboard-manager:allow-write-text | Handoff "Copy path" / "Copy resume command" (EKI-80). Write-only: the webview may never READ the clipboard.                                                                                                    |
| settings.json   | settings | core:default                       | Settings window (EKI-20): event listen for `SettingChanged` reconciliation + typed IPC. Nothing else.                                                                                                          |
| —               | —        | tauri-plugin-dialog (no grant)     | Folder picker (EKI-85, D-M3-7). Plugin registered in the builder, invoked Rust-side only via the `pick_folder` command; no capability file grants `dialog:*` — the webview cannot open dialogs itself.         |
| main.json       | main     | notification:default               | OS notification sink (EKI-92, D-M6-4/5): the frontend rule matcher dispatches `sink: "os"\|"both"` rules through the notification plugin's JS API. Send/permission only — the M6 milestone's single new grant. |

Forbidden without an ADR: `fs:*` to the webview (files go through Rust commands + path policy),
`shell:*` (only via dedicated commands, M2 handoff), any remote URL in `app.windows[].url`.

Note (D-M2-8): the M2 handoff feature grants NO shell permission — `handoff` is a typed Rust
command mapping a closed target enum to a fixed argv, executed via `std::process` after
path-policy validation. App-defined IPC commands are routed through the invoke handler and
are not part of the capability ACL (only core/plugin permissions are listed here).

Note (D-M3-7/D-M3-5): the M3 docs panel (`list_doc_tree`/`read_doc_file`/`read_doc_image`)
and git commands (`git_status`/`git_diff`/`git_default_base`) likewise add NO capability —
they are typed, read-only Rust commands behind the PathPolicy (whitelisted extensions,
depth/count/size caps; fixed-argv `git` CLI).

Note (M4 Lane 0): the orchestration surface (meetings/standups/runs/templates IPC,
the scheduler loop and headless executions) adds NO capability — everything is typed
app IPC routed through the invoke handler; child processes are spawned Rust-side only
via the provider's configured CLI path, never from the webview.

Note (M6 Lane 0): tray icon, dock badge, updater, importer, error reports and the hooks
bridge all add NO capability — tray/badge live entirely Rust-side (D-M6-5), and
updater/import/hooks/report surfaces are typed Rust commands (the D-M3-7 dialog
precedent). `notification:default` above is the milestone's only new webview grant.
