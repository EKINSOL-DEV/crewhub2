# Capability register

Every permission granted to a window MUST be listed here with a one-line justification.
PR reviewers: reject any capability change that does not update this file.

| Capability file | Window | Permission                         | Why                                                                                                         |
| --------------- | ------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| main.json       | main   | core:default                       | Event emit/listen for typed IPC events; window basics; app metadata for About.                              |
| main.json       | main   | clipboard-manager:allow-write-text | Handoff "Copy path" / "Copy resume command" (EKI-80). Write-only: the webview may never READ the clipboard. |

Forbidden without an ADR: `fs:*` to the webview (files go through Rust commands + path policy),
`shell:*` (only via dedicated commands, M2 handoff), any remote URL in `app.windows[].url`.

Note (D-M2-8): the M2 handoff feature grants NO shell permission — `handoff` is a typed Rust
command mapping a closed target enum to a fixed argv, executed via `std::process` after
path-policy validation. App-defined IPC commands are routed through the invoke handler and
are not part of the capability ACL (only core/plugin permissions are listed here).
