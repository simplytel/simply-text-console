import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useToast } from '../components/ToastProvider'
import { Modal } from '../components/Modal'
import { formatFullTimestamp, formatPhone, formatTimestamp } from '../lib/format'
import { usePageFocus } from '../lib/usePageFocus'
import type { Contact, Conversation, Message, RealtimeEvent } from '../lib/types'

const EMPTY_CONVERSATION: Conversation[] = []

export default function InboxPage() {
  const { user, setUser } = useAuth()
  const { push } = useToast()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [conversations, setConversations] = useState<Conversation[]>(EMPTY_CONVERSATION)
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, Message[]>>({})
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [draftPhone, setDraftPhone] = useState<string | null>(null)
  const [draftName, setDraftName] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showContactModal, setShowContactModal] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [showNewMessageModal, setShowNewMessageModal] = useState(false)
  const [composerText, setComposerText] = useState('')
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
    return Notification.permission
  })

  const isFocused = usePageFocus()
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const focusRef = useRef(isFocused)
  const activeConversationRef = useRef<string | null>(activeConversationId)
  const notificationRef = useRef(notificationPermission)

  const activeConversation = useMemo(
    () => (activeConversationId ? conversations.find((c) => c.id === activeConversationId) ?? null : null),
    [activeConversationId, conversations]
  )

  const activeMessages = activeConversationId ? messagesByConversation[activeConversationId] ?? [] : []

  const filteredConversations = useMemo(() => {
    if (!search.trim()) return conversations
    const query = search.toLowerCase()
    return conversations.filter((conversation) => {
      const name = (conversation.contact_name ?? '').toLowerCase()
      const phone = conversation.phone.toLowerCase()
      const snippet = (conversation.last_message_body ?? '').toLowerCase()
      return name.includes(query) || phone.includes(query) || snippet.includes(query)
    })
  }, [conversations, search])

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      try {
        const [contactsRes, conversationsRes] = await Promise.all([
          api.listContacts(),
          api.listConversations(),
        ])
        setContacts(contactsRes.contacts)
        setConversations(sortConversations(conversationsRes.conversations))
      } catch {
        push('Failed to load workspace data', 'error')
      } finally {
        setLoading(false)
      }
    }

    void init()
  }, [push])

  useEffect(() => {
    if (!activeConversationId) return
    const loadMessages = async () => {
      try {
        const res = await api.listMessages(activeConversationId)
        setMessagesByConversation((prev) => ({ ...prev, [activeConversationId]: res.messages }))
        await api.markRead(activeConversationId)
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === activeConversationId ? { ...conv, unread_count: 0 } : conv
          )
        )
      } catch {
        push('Failed to load messages', 'error')
      }
    }

    void loadMessages()
  }, [activeConversationId, push])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeConversationId, activeMessages.length])

  useEffect(() => {
    setComposerText('')
  }, [activeConversationId, draftPhone])

  useEffect(() => {
    focusRef.current = isFocused
  }, [isFocused])

  useEffect(() => {
    activeConversationRef.current = activeConversationId
  }, [activeConversationId])

  useEffect(() => {
    notificationRef.current = notificationPermission
  }, [notificationPermission])

  const applyIncomingMessage = useCallback(
    (data: Extract<RealtimeEvent, { type: 'message:new' }>) => {
      setConversations((prev) => updateConversationList(prev, data.conversation))
      setMessagesByConversation((prev) => {
        const existing = prev[data.conversationId] ?? []
        if (existing.some((msg) => msg.id === data.message.id)) return prev
        return { ...prev, [data.conversationId]: [...existing, data.message] }
      })

      if (data.message.direction === 'in') {
        const label = data.conversation.contact_name || formatPhone(data.conversation.phone)
        push(`New message from ${label}`, 'info')

        if (!focusRef.current && notificationRef.current === 'granted') {
          new Notification(`Message from ${label}`, {
            body: data.message.body,
          })
        }
      }

      if (activeConversationRef.current === data.conversationId) {
        void api.markRead(data.conversationId).catch(() => undefined)
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === data.conversationId ? { ...conv, unread_count: 0 } : conv
          )
        )
      }
    },
    [push]
  )

  const applyContactUpdate = useCallback(
    (event: Extract<RealtimeEvent, { type: 'contact:update' }>) => {
      if (event.deleted) {
        setContacts((prev) => prev.filter((c) => c.id !== event.contact.id))
        setConversations((prev) =>
          prev.map((conv) =>
            conv.phone === event.contact.phone
              ? { ...conv, contact_id: null, contact_name: null }
              : conv
          )
        )
        return
      }
      setContacts((prev) => {
        const exists = prev.some((c) => c.id === event.contact.id)
        if (!exists) return [...prev, event.contact].sort((a, b) => a.name.localeCompare(b.name))
        return prev.map((c) => (c.id === event.contact.id ? event.contact : c))
      })
      setConversations((prev) =>
        prev.map((conv) =>
          conv.phone === event.contact.phone
            ? { ...conv, contact_id: event.contact.id, contact_name: event.contact.name }
            : conv
        )
      )
    },
    []
  )

  useEffect(() => {
    if (!user) return
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${wsProtocol}://${window.location.host}/api/ws`)

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as RealtimeEvent
        if (data.type === 'message:new') {
          applyIncomingMessage(data)
        } else if (data.type === 'conversation:update') {
          setConversations((prev) => updateConversationList(prev, data.conversation))
        } else if (data.type === 'contact:update') {
          applyContactUpdate(data)
        }
      } catch {
        return
      }
    }

    ws.addEventListener('message', handleMessage)

    ws.addEventListener('close', () => {
      push('Realtime connection closed. Refresh if needed.', 'error')
    })

    return () => {
      ws.removeEventListener('message', handleMessage)
      ws.close()
    }
  }, [applyContactUpdate, applyIncomingMessage, push, user])

  const handleSelectConversation = (conversation: Conversation) => {
    setActiveConversationId(conversation.id)
    setDraftPhone(null)
    setDraftName(null)
  }

  const handleSelectContact = (contact: Contact) => {
    const conversation = conversations.find((conv) => conv.phone === contact.phone)
    if (conversation) {
      handleSelectConversation(conversation)
    } else {
      setDraftPhone(contact.phone)
      setDraftName(contact.name)
      setActiveConversationId(null)
    }
  }

  const handleSendMessage = async () => {
    const targetPhone = activeConversation?.phone ?? draftPhone
    const body = composerText.trim()
    if (!targetPhone || !body) return

    try {
      const { conversation, message } = await api.sendMessage({ toPhone: targetPhone, body })
      setComposerText('')
      setConversations((prev) => updateConversationList(prev, conversation))
      setMessagesByConversation((prev) => {
        const existing = prev[conversation.id] ?? []
        if (existing.some((msg) => msg.id === message.id)) return prev
        return { ...prev, [conversation.id]: [...existing, message] }
      })
      setActiveConversationId(conversation.id)
      setDraftPhone(null)
      setDraftName(null)
    } catch (err) {
      if (err instanceof ApiError) {
        push(err.message, 'error')
      } else {
        push('Failed to send message', 'error')
      }
    }
  }

  const handleLogout = async () => {
    await api.logout().catch(() => undefined)
    setUser(null)
  }

  const handleSaveContact = async (payload: { name: string; phone: string }, id?: string) => {
    try {
      if (id) {
        const { contact } = await api.updateContact(id, payload)
        setContacts((prev) => prev.map((c) => (c.id === id ? contact : c)))
        push('Contact updated', 'success')
      } else {
        const { contact } = await api.createContact(payload)
        setContacts((prev) => [...prev, contact].sort((a, b) => a.name.localeCompare(b.name)))
        push('Contact added', 'success')
      }
      setShowContactModal(false)
      setEditingContact(null)
    } catch (err) {
      push(err instanceof ApiError ? err.message : 'Failed to save contact', 'error')
    }
  }

  const handleDeleteContact = async (contact: Contact) => {
    try {
      await api.deleteContact(contact.id)
      setContacts((prev) => prev.filter((c) => c.id !== contact.id))
      setConversations((prev) =>
        prev.map((conv) =>
          conv.phone === contact.phone ? { ...conv, contact_id: null, contact_name: null } : conv
        )
      )
      setShowContactModal(false)
      setEditingContact(null)
      push('Contact removed', 'success')
    } catch {
      push('Failed to delete contact', 'error')
    }
  }

  const handleRequestNotification = async () => {
    if (notificationPermission === 'unsupported') return
    const result = await Notification.requestPermission()
    setNotificationPermission(result)
  }

  const openContactModal = (contact?: Contact) => {
    setEditingContact(contact ?? null)
    setShowContactModal(true)
  }

  const openNewMessageModal = () => {
    setShowNewMessageModal(true)
  }

  const headerName = activeConversation?.contact_name ?? draftName ?? null
  const headerPhone = activeConversation?.phone ?? draftPhone

  return (
    <div className="min-h-screen">
      <div className="border-b border-clay bg-white/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cocoa">Text Console</p>
            <h1 className="text-xl font-semibold text-ink">Workspace {user?.workspace_id}</h1>
          </div>
          <div className="flex items-center gap-3 text-sm text-cocoa">
            <div className="rounded-full border border-clay px-3 py-1">{user?.display_name}</div>
            {notificationPermission === 'default' ? (
              <button
                onClick={handleRequestNotification}
                className="rounded-full border border-ember px-3 py-1 text-xs uppercase tracking-wide text-ember"
              >
                Enable Notifications
              </button>
            ) : null}
            <button
              onClick={handleLogout}
              className="rounded-full border border-clay px-3 py-1 text-xs uppercase tracking-wide text-cocoa"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl gap-6 px-6 py-6">
        <aside className="flex w-[320px] flex-col gap-4">
          <div className="rounded-3xl border border-clay bg-white/80 p-4 shadow-soft backdrop-blur">
            <div className="flex items-center gap-2">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-2xl border border-clay bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ember"
                placeholder="Search conversations"
              />
              <button
                onClick={openNewMessageModal}
                className="rounded-2xl bg-ink px-3 py-2 text-xs font-semibold uppercase tracking-wide text-sand"
              >
                New
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {loading ? (
                <p className="text-xs text-cocoa">Loading...</p>
              ) : filteredConversations.length === 0 ? (
                <p className="text-xs text-cocoa">No conversations yet.</p>
              ) : (
                filteredConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    onClick={() => handleSelectConversation(conversation)}
                    className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                      conversation.id === activeConversationId
                        ? 'border-ember bg-ember/10'
                        : 'border-transparent hover:border-clay hover:bg-sand/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          {conversation.contact_name || formatPhone(conversation.phone)}
                        </p>
                        <p className="truncate text-xs text-cocoa">
                          {conversation.last_message_body ?? 'No messages yet'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-cocoa">
                          {formatTimestamp(conversation.last_message_at)}
                        </span>
                        {conversation.unread_count > 0 ? (
                          <span className="rounded-full bg-ember px-2 py-0.5 text-[10px] font-semibold text-white">
                            {conversation.unread_count}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-clay bg-white/80 p-4 shadow-soft backdrop-blur">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Contacts / Speed Dial</h2>
              <button
                onClick={() => openContactModal()}
                className="rounded-full border border-clay px-2 py-1 text-[10px] uppercase tracking-wide text-cocoa"
              >
                Add
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {contacts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-clay p-3 text-xs text-cocoa">
                  Add your first driver contact to get started.
                </div>
              ) : (
                contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between rounded-2xl border border-transparent bg-sand/50 px-3 py-2"
                  >
                    <button
                      onClick={() => handleSelectContact(contact)}
                      className="text-left"
                    >
                      <p className="text-sm font-semibold text-ink">{contact.name}</p>
                      <p className="text-xs text-cocoa">{formatPhone(contact.phone)}</p>
                    </button>
                    <button
                      onClick={() => openContactModal(contact)}
                      className="text-[10px] uppercase tracking-wide text-cocoa"
                    >
                      Edit
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        <main className="flex flex-1 flex-col rounded-3xl border border-clay bg-white/80 shadow-soft backdrop-blur">
          <div className="border-b border-clay px-6 py-4">
            {headerPhone ? (
              <div>
                <h2 className="text-lg font-semibold text-ink">
                  {headerName || formatPhone(headerPhone)}
                </h2>
                <p className="text-xs text-cocoa">{formatPhone(headerPhone)}</p>
              </div>
            ) : (
              <div>
                <h2 className="text-lg font-semibold text-ink">Select a conversation</h2>
                <p className="text-xs text-cocoa">Choose a chat to view messages.</p>
              </div>
            )}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
            {headerPhone ? (
              activeMessages.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-clay bg-sand/60 p-6 text-center text-sm text-cocoa">
                  No messages yet. Send the first note to start this thread.
                </div>
              ) : (
                activeMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.direction === 'out' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-3xl px-4 py-3 text-sm shadow-sm ${
                        message.direction === 'out'
                          ? 'bg-ink text-sand'
                          : 'bg-sand text-ink'
                      }`}
                    >
                      <p>{message.body}</p>
                      <p className="mt-2 text-[10px] uppercase tracking-wide opacity-70">
                        {formatFullTimestamp(message.created_at)}
                      </p>
                    </div>
                  </div>
                ))
              )
            ) : (
              <div className="rounded-3xl border border-dashed border-clay bg-sand/60 p-6 text-center text-sm text-cocoa">
                Pick a conversation from the left or start a new one.
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-clay px-6 py-4">
            <div className="flex items-end gap-3">
              <textarea
                value={composerText}
                onChange={(event) => setComposerText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void handleSendMessage()
                  }
                }}
                className="min-h-[64px] flex-1 resize-none rounded-2xl border border-clay bg-white px-4 py-3 text-sm text-ink outline-none focus:border-ember"
                placeholder={headerPhone ? 'Write a message...' : 'Select a conversation to start'}
                disabled={!headerPhone}
              />
              <button
                onClick={() => void handleSendMessage()}
                disabled={!headerPhone || !composerText.trim()}
                className="rounded-2xl bg-ember px-5 py-3 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
              >
                Send
              </button>
            </div>
            <p className="mt-2 text-[10px] uppercase tracking-wide text-cocoa">
              Press Enter to send, Shift + Enter for a new line.
            </p>
          </div>
        </main>
      </div>

      {showContactModal ? (
        <ContactModal
          contact={editingContact}
          onClose={() => {
            setShowContactModal(false)
            setEditingContact(null)
          }}
          onSave={handleSaveContact}
          onDelete={handleDeleteContact}
        />
      ) : null}

      {showNewMessageModal ? (
        <NewMessageModal
          onClose={() => setShowNewMessageModal(false)}
          onSend={async (payload) => {
            try {
              const { conversation, message } = await api.sendMessage(payload)
              setConversations((prev) => updateConversationList(prev, conversation))
              setMessagesByConversation((prev) => ({
                ...prev,
                [conversation.id]: [...(prev[conversation.id] ?? []), message],
              }))
              setActiveConversationId(conversation.id)
              setDraftPhone(null)
              setDraftName(null)
              setShowNewMessageModal(false)
            } catch (err) {
              push(err instanceof ApiError ? err.message : 'Failed to send message', 'error')
            }
          }}
        />
      ) : null}
    </div>
  )
}

function sortConversations(list: Conversation[]) {
  return [...list].sort((a, b) => {
    const aScore = a.last_message_at ?? a.created_at
    const bScore = b.last_message_at ?? b.created_at
    return bScore - aScore
  })
}

function updateConversationList(list: Conversation[], conversation: Conversation) {
  const next = list.filter((item) => item.id !== conversation.id)
  next.push(conversation)
  return sortConversations(next)
}

function ContactModal({
  contact,
  onClose,
  onSave,
  onDelete,
}: {
  contact: Contact | null
  onClose: () => void
  onSave: (payload: { name: string; phone: string }, id?: string) => void
  onDelete: (contact: Contact) => void
}) {
  const [name, setName] = useState(contact?.name ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [error, setError] = useState<string | null>(null)

  return (
    <Modal
      title={contact ? 'Edit contact' : 'Add contact'}
      onClose={onClose}
      actions={
        <>
          {contact ? (
            <button
              onClick={() => onDelete(contact)}
              className="rounded-full border border-red-300 px-3 py-2 text-xs uppercase tracking-wide text-red-600"
            >
              Delete
            </button>
          ) : null}
          <button
            onClick={() => {
              if (!name.trim() || !phone.trim()) {
                setError('Name and phone are required')
                return
              }
              setError(null)
              onSave({ name: name.trim(), phone: phone.trim() }, contact?.id)
            }}
            className="rounded-full bg-ink px-4 py-2 text-xs font-semibold uppercase tracking-wide text-sand"
          >
            Save
          </button>
        </>
      }
    >
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-cocoa">Name</label>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-2 w-full rounded-2xl border border-clay px-4 py-3 text-sm text-ink outline-none focus:border-ember"
          placeholder="Driver name"
        />
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-cocoa">Phone</label>
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="mt-2 w-full rounded-2xl border border-clay px-4 py-3 text-sm text-ink outline-none focus:border-ember"
          placeholder="+1XXXXXXXXXX"
        />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </Modal>
  )
}

function NewMessageModal({
  onClose,
  onSend,
}: {
  onClose: () => void
  onSend: (payload: { toPhone: string; body: string }) => Promise<void>
}) {
  const [toPhone, setToPhone] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSend = async () => {
    if (!toPhone.trim() || !body.trim()) {
      setError('Phone and message are required')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await onSend({ toPhone: toPhone.trim(), body: body.trim() })
    } catch {
      setError('Failed to send message')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title="New message"
      onClose={onClose}
      actions={
        <button
          onClick={() => void handleSend()}
          disabled={loading}
          className="rounded-full bg-ember px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-70"
        >
          {loading ? 'Sending...' : 'Send'}
        </button>
      }
    >
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-cocoa">To phone</label>
        <input
          value={toPhone}
          onChange={(event) => setToPhone(event.target.value)}
          className="mt-2 w-full rounded-2xl border border-clay px-4 py-3 text-sm text-ink outline-none focus:border-ember"
          placeholder="+1XXXXXXXXXX"
        />
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-cocoa">Message</label>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="mt-2 min-h-[120px] w-full resize-none rounded-2xl border border-clay px-4 py-3 text-sm text-ink outline-none focus:border-ember"
          placeholder="Write your first message..."
        />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </Modal>
  )
}
