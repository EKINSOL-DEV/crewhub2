# Capability register

Every permission granted to a window MUST be listed here with a one-line justification.
PR reviewers: reject any capability change that does not update this file.

| Capability file | Window | Permission   | Why                                                                            |
| --------------- | ------ | ------------ | ------------------------------------------------------------------------------ |
| main.json       | main   | core:default | Event emit/listen for typed IPC events; window basics; app metadata for About. |

Forbidden without an ADR: `fs:*` to the webview (files go through Rust commands + path policy),
`shell:*` (only via dedicated commands, M2 handoff), any remote URL in `app.windows[].url`.
