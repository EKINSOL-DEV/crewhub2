/* Adapter for the copied chat: the types it imports from loops' `api/types`. Wire types that packages/loops-client already
   declares are re-exported from there; the web-only contracts below are copied from crewhub-loops
   apps/web/src/api/types.ts @ a1bed0f (they are not in docs/integrators/read-model.md). */
import type { AgentOut, DmMessage, RichBody, TicketStatus } from "@crewhub/loops-client";

export type {
  AgentOut,
  DeliveryOut,
  DeliveryState,
  DmMessage,
  DmMessagesResponse,
  DmThread,
  DmThreadsResponse,
  PrincipalKind,
  PrincipalRef,
  ProgressKind,
  RichBody,
} from "@crewhub/loops-client";

export type Status = TicketStatus;

// Source: crewhub-loops apps/web/src/api/types.ts @ a1bed0f (ApiErrorCode, FeatureOut, GlobalFeatureResponse, the chat
// contracts and AgentsResponse), unchanged except that AgentOut is loops-client's.
export type ApiErrorCode =
  | 'unauthenticated'
  | 'invalid_api_key'
  | 'bad_credentials'
  | 'forbidden'
  | 'origin_forbidden'
  | 'user_disabled'
  | 'agent_disabled'
  | 'not_found'
  | 'method_not_allowed'
  | 'validation_error'
  | 'ambiguous_auth'
  | 'body_conflict'
  | 'richtext_invalid'
  | 'bad_anchor'
  | 'no_link_type'
  | 'attachment_foreign'
  | 'version_conflict'
  | 'exists'
  | 'conflict'
  | 'last_admin'
  | 'stale_attempt'
  | 'length_required'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'cursor_expired'
  | 'too_many_attempts'
  | 'upload_busy'
  | 'upload_rate'
  | 'progress_rate'
  | 'ticket_archived'
  | 'snapshot_stale'
  | 'human_only_done'
  | 'waiting_on_done'
  | 'nothing_to_release'
  | 'draft_exists'
  | 'not_eligible'
  | 'no_release_lead'
  | 'feature_off'
  | 'feature_in_use'
  | 'milestone_open'
  | 'milestone_closed'
  | 'milestone_archived'
  | 'milestone_has_history'
  | 'carrier_ticket'
  | 'ticket_held'
  | 'no_handoff_recipient'
  | 'request_conflict'
  | 'handoff_final'
  | 'key_reserved'
  | 'key_in_use'
  | 'project_archived'
  | 'relation_exists'
  | 'relation_cycle'
  | 'project_protected'
  | 'project_busy'
  | 'label_in_use'
  | 'label_reserved'
  | 'release_target_locked'
  | 'release_frozen'
  | 'release_published'
  | 'notes_required'
  | 'version_required'
  | 'bad_tag_url'
  | 'bad_app_note'
  | 'publish_not_requested'
  | 'link_fetch_failed'
  | 'disk_low'
  | 'owner_only'
  | 'authority_files'
  | 'internal_error'

export interface FeatureOut {
  key: string
  label: string
  type: 'bool'
  value: boolean
  default: boolean
  revision: number
  updatedAt: string | null
  updatedBy: string | null
}

export interface GlobalFeatureResponse {
  feature: FeatureOut
}

export interface DmMessageResponse {
  message: DmMessage
}

export interface BubblesResponse {
  pinnedAgentIds: string[]
}

export interface DmMessageRequest {
  body?: RichBody | null
  bodyMarkdown?: string | null
  clientId: string
}

export interface AgentSummaryComment {
  id: string
  text: string
  createdAt: string
  ticketKey: string
  url: string
}

export interface AgentSummaryTicket {
  id: string
  key: string
  title: string
  status: Status
  url: string
}

export interface AgentSummaryResponse {
  comments: AgentSummaryComment[]
  tickets: AgentSummaryTicket[]
}

export interface AgentsResponse {
  agents: AgentOut[]
}
