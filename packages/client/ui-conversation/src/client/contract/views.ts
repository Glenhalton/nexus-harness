/** Conversation view and session-local presentation state. */

/** Tool call identity as carried on the wire (branded upstream in connection). */
export type CallId = string

/** Selection target for the details linkage channel. */
export type SelectionTarget =
  | { kind: 'tool'; turnSeq: number; stepSeq?: number; callId?: CallId; toolName?: string }
  | { kind: 'subagent'; sessionId: string }

/**
 * One conversation view tab, projected from a 'conversation.view' slot
 * entry's registration options (label falls back to the entry id).
 */
export interface ViewTab { id: string; label: string }

/** One-shot focus request addressed to a Conversation View. */
export interface ConversationViewRequest {
  /** Target `conversation.view` entry id. */
  readonly view: string
  /** Target-owned opaque focus identity. */
  readonly focus: string
}

/** Per-session state owned by the target-neutral Conversation shell. */
export interface ConversationStoreState {
  /** Composer draft (persisted; survives session switches and reloads). */
  draft: string
  /** Preferred `conversation.view` entry id; null resolves to Chat when registered. */
  view: string | null
  /** Focus request consumed and acknowledged by the addressed View. */
  viewRequest: ConversationViewRequest | null
}
