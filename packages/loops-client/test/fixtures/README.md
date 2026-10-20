# Fixtures

Answers and envelopes in the shapes crewhub-loops serves, for `validate.test.ts`. JSON has no comments, so the
sources are named here. The loops commit is `053b5f47` (checked on 2026-10-07: between `f55d1288` and `053b5f47`
the contracts these fixtures follow changed only in `contracts/common.py`, where `Kind` gained `grill`; the
integrator documents changed by three lines, the `GET /api/tickets/{ref}/grill` route); `loops:` is a path in the
crewhub-loops repository and `loops:.../` abbreviates `loops:services/api/src/crewhub_loops/`.

| Fixture | Written from |
| --- | --- |
| `agents.json` | **At `4cdcd383`** (2026-10-21). The code, not the documents (read-model.md has no schema block): `loops:.../contracts/agents.py` (`AgentsDetailResponse` with `lanesAuthority` and `agentHome`, `AgentDetailOut` with `computer`, `external`, `reader`, `notPickedUp`, `needsLoginSince`, `AgentProjects`, `AgentLane` with `desired`, `observed`, `observedAt`, `drift`, `lifecycle`, `restarting`), `loops:.../contracts/computers.py` (`ComputerOut`), with the values `loops:services/api/tests/test_api_agents_admin.py` expects for `cr-lead` (`projects` as `{lead, member}` of `{slug, key}`). Five agents: `cr-lead` with a lane the probe observed and two drifts, `g-man` (the CrewHub lead, no lane), `crewhub-world` (an external bot, CL-314: `external: true`, `herdrSession: "external:none"` as the development instance really answers, `lane: null`), `old-lead` (disabled, a closed lane never observed), `marky` (a remote computer, `needsLoginSince`, an observation from `started`, restarting, `notPickedUp: 2`). The key sets were checked against the OpenAPI dump of `4cdcd383` (`LaneDesired`, `LaneObserved`, `LaneOut`, `ComputerOut`; `GET /api/agents` has no schema there, it is a dict) and against the development instance's real answer. |
| `ticket.json`, `dm.json`, `comments-progress.json` | The schema blocks of `loops:docs/integrators/read-model.md`, with `v` as the number 1 (`loops:.../contracts/richtext.py`, `RichBody` and `SystemCommentBody`: `v: Literal[1]`; the document prints `"1"`). The system comment and the deleted comment follow `loops:.../api/serializers.py`, `comments_out`. `resolution` and `resolutionReason` follow `loops:.../contracts/tickets.py`. |
| `envelope-ticket-moved.json` | The envelope example of `loops:docs/integrators/events.md`. |
| `envelope-ticket-moved-rejected.json` | The `ticket.moved` emit in `loops:.../domain/board.py` (`_apply_move`) for a rejection, with the reason `loops:services/api/tests/test_api_reject.py` uses (`test_a_person_rejects_with_a_reason`). |
| `envelope-ticket-moved-deploy.json` | The same emit for a ticket that leaves In progress with the `awaiting-deploy` label (`loops:services/api/tests/test_domain_board.py`, `test_leaving_in_progress_clears_the_deploy_label_with_history`), with the `code: "deployed"` a deploy adds (`loops:.../domain/deploys.py`, `_move_snapshot`). |
| `team-snapshot.json` | **At `4cdcd383`.** The example of `loops:docs/integrators/team-and-projects.md` with `TeamSession.computer` (CL-459, `loops:.../contracts/team.py`, `ComputerOut`): two sessions, one on this computer and one remote; `v` is the number 1. Checked against the OpenAPI dump (`TeamSnapshot`, `TeamSession`, `TeamAgent`, `ComputerOut`). |
| `ticket-grill.json` | A `grill` ticket (CL-245): `loops:.../contracts/common.py` `Kind` and `loops:.../domain/ticket_kind.py`; the questions themselves are the reply comments `GET /api/tickets/{ref}/grill` lists, which the world does not read. |
| `pending-requests.json` | `GET /api/delegations/pending` (CL-240): `loops:.../contracts/delegations.py` (`PendingRequestsResponse`, `PendingRequestOut`, camelCase on the wire) and the route in `loops:.../api/routers/agents.py`. Owner only; the world does not read it, the validator exists so the type stays honest. |
| `board.json`, `projects.json`, `milestones.json`, `releases.json`, `watchdog.json` | The schema blocks of `loops:docs/integrators/read-model.md`, as at `a1bed0f`. The keys loops added up to `f55d1288` (docs/LOOPS_GAP_ANALYSIS.md, D4) are optional and not in these files. |

These are written by hand from the loops code and its tests. Fixtures recorded from a running crewhub-loops are
still to do (docs/LOOPS_GAP_ANALYSIS.md, section 7, item 4).
