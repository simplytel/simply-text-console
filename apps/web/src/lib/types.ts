export type User = {
  id: string
  workspace_id: string
  display_name: string
}

export type Contact = {
  id: string
  workspace_id: string
  name: string
  phone: string
  created_at: number
}

export type Conversation = {
  id: string
  workspace_id: string
  contact_id: string | null
  phone: string
  last_message_at: number | null
  unread_count: number
  created_at: number
  contact_name?: string | null
  last_message_body?: string | null
  last_message_direction?: 'in' | 'out' | null
}

export type Message = {
  id: string
  workspace_id: string
  conversation_id: string
  direction: 'in' | 'out'
  from_phone: string
  to_phone: string
  body: string
  created_at: number
  status: string
}

export type RealtimeEvent =
  | {
      type: 'message:new'
      conversationId: string
      conversation: Conversation
      message: Message
    }
  | { type: 'conversation:update'; conversation: Conversation }
  | { type: 'contact:update'; contact: Contact; deleted?: boolean }
