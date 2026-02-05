import type { Contact, Conversation, Message, User } from './types'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    ...options,
  })

  if (!res.ok) {
    const message = await safeMessage(res)
    throw new ApiError(message || 'Request failed', res.status)
  }

  if (res.status === 204) return undefined as T

  return (await res.json()) as T
}

async function safeMessage(res: Response) {
  try {
    const data = (await res.json()) as { error?: string }
    return data?.error
  } catch {
    try {
      return await res.text()
    } catch {
      return ''
    }
  }
}

export const api = {
  me: () => request<{ user: User }>('/api/me'),
  login: (payload: { workspaceCode: string; pin: string; displayName: string }) =>
    request<{ user: User }>('/api/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  logout: () => request<{ ok: true }>('/api/logout', { method: 'POST' }),
  listConversations: () => request<{ conversations: Conversation[] }>('/api/conversations'),
  listContacts: () => request<{ contacts: Contact[] }>('/api/contacts'),
  listMessages: (conversationId: string, opts?: { limit?: number; before?: number }) => {
    const params = new URLSearchParams()
    if (opts?.limit) params.set('limit', String(opts.limit))
    if (opts?.before) params.set('before', String(opts.before))
    const query = params.toString()
    return request<{ messages: Message[] }>(
      `/api/conversations/${conversationId}/messages${query ? `?${query}` : ''}`
    )
  },
  markRead: (conversationId: string) =>
    request<{ ok: true }>(`/api/conversations/${conversationId}/read`, { method: 'POST' }),
  sendMessage: (payload: { toPhone: string; body: string }) =>
    request<{ conversation: Conversation; message: Message }>('/api/messages/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createContact: (payload: { name: string; phone: string }) =>
    request<{ contact: Contact }>('/api/contacts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateContact: (id: string, payload: { name: string; phone: string }) =>
    request<{ contact: Contact }>(`/api/contacts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteContact: (id: string) =>
    request<{ ok: true }>(`/api/contacts/${id}`, {
      method: 'DELETE' }),
  devInbound: (payload: { fromPhone: string; body: string }) =>
    request<{ conversation: Conversation; message: Message }>(`/api/dev/inbound`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}
