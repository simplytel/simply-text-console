type SessionPayload = {
  sub: string
  ws: string
  dn: string
  exp: number
}

type ConversationRow = {
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

type ContactRow = {
  id: string
  workspace_id: string
  name: string
  phone: string
  created_at: number
}

type MessageRow = {
  id: string
  workspace_id: string
  conversation_id: string
  direction: 'in' | 'out'
  from_phone: string
  to_phone: string
  body: string
  created_at: number
  provider_message_id: string | null
  status: string
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

type RealtimeEvent =
  | {
      type: 'message:new'
      conversationId: string
      conversation: ConversationRow
      message: MessageRow
    }
  | { type: 'conversation:update'; conversation: ConversationRow }
  | { type: 'contact:update'; contact: ContactRow; deleted?: boolean }

interface Env {
  ASSETS: Fetcher
  DB: D1Database
  CHATHUB: DurableObjectNamespace
  APP_WORKSPACE_CODE: string
  APP_SHARED_PIN: string
  SESSION_SECRET: string
  DEV_MODE: string
}

const SESSION_COOKIE = 'tc_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7
const MAX_MESSAGE_LENGTH = 2000
const MAX_NAME_LENGTH = 80

let sessionKeyPromise: Promise<CryptoKey> | null = null

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env)
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request)
    }

    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>

export class ChatHub {
  private state: DurableObjectState

  constructor(state: DurableObjectState) {
    this.state = state
  }

  async fetch(request: Request) {
    const url = new URL(request.url)

    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)
      this.state.acceptWebSocket(server)
      return new Response(null, { status: 101, webSocket: client })
    }

    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const payload = (await request.json()) as JsonValue
      this.broadcast(payload)
      return json({ ok: true })
    }

    return new Response('Not found', { status: 404 })
  }

  private broadcast(payload: JsonValue) {
    const message = JSON.stringify(payload)
    for (const socket of this.state.getWebSockets()) {
      try {
        socket.send(message)
      } catch {
        socket.close(1011, 'Broadcast failed')
      }
    }
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message === 'string' && message === 'ping') {
      ws.send('pong')
    }
  }
}

async function handleApi(request: Request, env: Env) {
  const url = new URL(request.url)
  const { pathname } = url

  if (isStateChanging(request) && !isSameOrigin(request)) {
    return json({ error: 'Invalid origin' }, 403)
  }

  if (pathname === '/api/login' && request.method === 'POST') {
    return handleLogin(request, env)
  }

  if (pathname === '/api/logout' && request.method === 'POST') {
    return handleLogout(request)
  }

  if (pathname === '/api/me' && request.method === 'GET') {
    const session = await requireSession(request, env)
    if (!session) return json({ error: 'Unauthorized' }, 401)
    return json({ user: { id: session.sub, workspace_id: session.ws, display_name: session.dn } })
  }

  const session = await requireSession(request, env)
  if (!session) return json({ error: 'Unauthorized' }, 401)

  if (pathname === '/api/ws') {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return json({ error: 'Expected websocket upgrade' }, 400)
    }
    const stub = getChatHubStub(env, session.ws)
    return stub.fetch(request)
  }

  const path = pathname.replace(/^\/api\/?/, '')
  const parts = path.split('/').filter(Boolean)

  if (parts[0] === 'conversations' && request.method === 'GET' && parts.length === 1) {
    return handleListConversations(env, session.ws)
  }

  if (parts[0] === 'conversations' && parts.length === 3 && parts[2] === 'read') {
    if (request.method === 'POST') {
      return handleReadConversation(env, session.ws, parts[1])
    }
  }

  if (parts[0] === 'conversations' && parts.length === 3 && parts[2] === 'messages') {
    if (request.method === 'GET') {
      return handleListMessages(env, session.ws, parts[1], url)
    }
  }

  if (parts[0] === 'messages' && parts[1] === 'send' && request.method === 'POST') {
    return handleSendMessage(request, env, session.ws)
  }

  if (parts[0] === 'dev' && parts[1] === 'inbound' && request.method === 'POST') {
    if (env.DEV_MODE !== 'true') {
      return json({ error: 'Dev endpoint disabled' }, 403)
    }
    return handleDevInbound(request, env, session.ws)
  }

  if (parts[0] === 'contacts' && parts.length === 1) {
    if (request.method === 'GET') {
      return handleListContacts(env, session.ws)
    }
    if (request.method === 'POST') {
      return handleCreateContact(request, env, session.ws)
    }
  }

  if (parts[0] === 'contacts' && parts.length === 2 && parts[1]) {
    if (request.method === 'PUT') {
      return handleUpdateContact(request, env, session.ws, parts[1])
    }
    if (request.method === 'DELETE') {
      return handleDeleteContact(env, session.ws, parts[1])
    }
  }

  return json({ error: 'Not found' }, 404)
}

function isStateChanging(request: Request) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get('Origin')
  if (!origin) return true
  try {
    const url = new URL(request.url)
    return origin === url.origin
  } catch {
    return false
  }
}

async function handleLogin(request: Request, env: Env) {
  const body = asRecord(await readJson(request))
  if (!body) return json({ error: 'Invalid JSON' }, 400)

  const workspaceCode = String(body.workspaceCode ?? '').trim()
  const pin = String(body.pin ?? '').trim()
  const displayName = String(body.displayName ?? '').trim()

  if (!workspaceCode || !pin || !displayName) {
    return json({ error: 'Missing fields' }, 400)
  }

  if (displayName.length > MAX_NAME_LENGTH) {
    return json({ error: 'Display name too long' }, 400)
  }

  if (workspaceCode !== env.APP_WORKSPACE_CODE || pin !== env.APP_SHARED_PIN) {
    return json({ error: 'Invalid workspace code or PIN' }, 401)
  }

  const workspaceId = workspaceCode

  let user = (await env.DB.prepare(
    'SELECT id, workspace_id, display_name, created_at FROM users WHERE workspace_id = ? AND display_name = ?'
  )
    .bind(workspaceId, displayName)
    .first()) as { id: string; workspace_id: string; display_name: string; created_at: number } | null

  if (!user) {
    const id = crypto.randomUUID()
    const createdAt = Date.now()
    await env.DB.prepare(
      'INSERT INTO users (id, workspace_id, display_name, created_at) VALUES (?, ?, ?, ?)'
    )
      .bind(id, workspaceId, displayName, createdAt)
      .run()
    user = { id, workspace_id: workspaceId, display_name: displayName, created_at: createdAt }
  }

  const token = await createSessionToken(
    {
      sub: user.id,
      ws: workspaceId,
      dn: user.display_name,
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    },
    env
  )

  const cookie = makeSessionCookie(token, new URL(request.url))

  return json({ user }, 200, {
    'Set-Cookie': cookie,
  })
}

async function handleLogout(request: Request) {
  const cookie = clearSessionCookie(new URL(request.url))
  return json({ ok: true }, 200, { 'Set-Cookie': cookie })
}

async function handleListConversations(env: Env, workspaceId: string) {
  const stmt = env.DB.prepare(
    `
    SELECT
      c.id,
      c.workspace_id,
      c.contact_id,
      c.phone,
      c.last_message_at,
      c.unread_count,
      c.created_at,
      ct.name as contact_name,
      (
        SELECT body FROM messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) as last_message_body,
      (
        SELECT direction FROM messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) as last_message_direction
    FROM conversations c
    LEFT JOIN contacts ct ON c.contact_id = ct.id
    WHERE c.workspace_id = ?
    ORDER BY c.last_message_at IS NULL, c.last_message_at DESC, c.created_at DESC
  `
  ).bind(workspaceId)

  const { results } = await stmt.all()
  return json({ conversations: results as ConversationRow[] })
}

async function handleListMessages(env: Env, workspaceId: string, conversationId: string, url: URL) {
  const limitRaw = Number(url.searchParams.get('limit') ?? '100')
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100
  const beforeRaw = Number(url.searchParams.get('before') ?? '')
  const before = Number.isFinite(beforeRaw) ? beforeRaw : null

  let stmt
  if (before) {
    stmt = env.DB.prepare(
      `
      SELECT id, workspace_id, conversation_id, direction, from_phone, to_phone, body, created_at, provider_message_id, status
      FROM messages
      WHERE workspace_id = ? AND conversation_id = ? AND created_at < ?
      ORDER BY created_at DESC
      LIMIT ?
    `
    ).bind(workspaceId, conversationId, before, limit)
  } else {
    stmt = env.DB.prepare(
      `
      SELECT id, workspace_id, conversation_id, direction, from_phone, to_phone, body, created_at, provider_message_id, status
      FROM messages
      WHERE workspace_id = ? AND conversation_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `
    ).bind(workspaceId, conversationId, limit)
  }

  const { results } = await stmt.all()
  const messages = (results as MessageRow[]).slice().reverse()
  return json({ messages })
}

async function handleReadConversation(env: Env, workspaceId: string, conversationId: string) {
  await env.DB.prepare(
    'UPDATE conversations SET unread_count = 0 WHERE id = ? AND workspace_id = ?'
  )
    .bind(conversationId, workspaceId)
    .run()
  return json({ ok: true })
}

async function handleSendMessage(request: Request, env: Env, workspaceId: string) {
  const body = asRecord(await readJson(request))
  if (!body) return json({ error: 'Invalid JSON' }, 400)

  const rawPhone = String(body.toPhone ?? '').trim()
  const messageBody = String(body.body ?? '').trim()

  if (!rawPhone || !messageBody) {
    return json({ error: 'Missing phone or body' }, 400)
  }

  if (messageBody.length > MAX_MESSAGE_LENGTH) {
    return json({ error: 'Message too long' }, 400)
  }

  const toPhone = normalizePhone(rawPhone)
  if (!toPhone) return json({ error: 'Invalid phone' }, 400)

  const { conversation, contact } = await ensureConversation(env, workspaceId, toPhone)

  const message = await createMessage(env, workspaceId, {
    conversationId: conversation.id,
    direction: 'out',
    fromPhone: '+1SIMULATED',
    toPhone,
    body: messageBody,
  })

  const updatedConversation = await touchConversation(env, workspaceId, conversation.id, {
    lastMessageAt: message.created_at,
    incrementUnread: false,
  })

  const event: RealtimeEvent = {
    type: 'message:new',
    conversationId: conversation.id,
    conversation: { ...updatedConversation, contact_name: contact?.name ?? updatedConversation.contact_name },
    message,
  }

  await broadcast(env, workspaceId, event)

  return json({ conversation: event.conversation, message })
}

async function handleDevInbound(request: Request, env: Env, workspaceId: string) {
  const body = asRecord(await readJson(request))
  if (!body) return json({ error: 'Invalid JSON' }, 400)

  const rawPhone = String(body.fromPhone ?? '').trim()
  const messageBody = String(body.body ?? '').trim()

  if (!rawPhone || !messageBody) {
    return json({ error: 'Missing phone or body' }, 400)
  }

  if (messageBody.length > MAX_MESSAGE_LENGTH) {
    return json({ error: 'Message too long' }, 400)
  }

  const fromPhone = normalizePhone(rawPhone)
  if (!fromPhone) return json({ error: 'Invalid phone' }, 400)

  const { conversation, contact } = await ensureConversation(env, workspaceId, fromPhone)

  const message = await createMessage(env, workspaceId, {
    conversationId: conversation.id,
    direction: 'in',
    fromPhone,
    toPhone: '+1SIMULATED',
    body: messageBody,
  })

  const updatedConversation = await touchConversation(env, workspaceId, conversation.id, {
    lastMessageAt: message.created_at,
    incrementUnread: true,
  })

  const event: RealtimeEvent = {
    type: 'message:new',
    conversationId: conversation.id,
    conversation: { ...updatedConversation, contact_name: contact?.name ?? updatedConversation.contact_name },
    message,
  }

  await broadcast(env, workspaceId, event)

  return json({ conversation: event.conversation, message })
}

async function handleListContacts(env: Env, workspaceId: string) {
  const stmt = env.DB.prepare(
    'SELECT id, workspace_id, name, phone, created_at FROM contacts WHERE workspace_id = ? ORDER BY name ASC'
  ).bind(workspaceId)
  const { results } = await stmt.all()
  return json({ contacts: results as ContactRow[] })
}

async function handleCreateContact(request: Request, env: Env, workspaceId: string) {
  const body = asRecord(await readJson(request))
  if (!body) return json({ error: 'Invalid JSON' }, 400)

  const name = String(body.name ?? '').trim()
  const rawPhone = String(body.phone ?? '').trim()

  if (!name || !rawPhone) {
    return json({ error: 'Missing name or phone' }, 400)
  }

  if (name.length > MAX_NAME_LENGTH) {
    return json({ error: 'Name too long' }, 400)
  }

  const phone = normalizePhone(rawPhone)
  if (!phone) return json({ error: 'Invalid phone' }, 400)

  const id = crypto.randomUUID()
  const createdAt = Date.now()

  try {
    await env.DB.prepare(
      'INSERT INTO contacts (id, workspace_id, name, phone, created_at) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(id, workspaceId, name, phone, createdAt)
      .run()
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return json({ error: 'A contact with that phone already exists' }, 409)
    }
    throw err
  }

  const contact: ContactRow = { id, workspace_id: workspaceId, name, phone, created_at: createdAt }

  await linkConversationContact(env, workspaceId, contact)

  await broadcast(env, workspaceId, { type: 'contact:update', contact })

  return json({ contact })
}

async function handleUpdateContact(request: Request, env: Env, workspaceId: string, contactId: string) {
  const body = asRecord(await readJson(request))
  if (!body) return json({ error: 'Invalid JSON' }, 400)

  const name = String(body.name ?? '').trim()
  const rawPhone = String(body.phone ?? '').trim()

  if (!name || !rawPhone) {
    return json({ error: 'Missing name or phone' }, 400)
  }

  if (name.length > MAX_NAME_LENGTH) {
    return json({ error: 'Name too long' }, 400)
  }

  const phone = normalizePhone(rawPhone)
  if (!phone) return json({ error: 'Invalid phone' }, 400)

  try {
    await env.DB.prepare(
      'UPDATE contacts SET name = ?, phone = ? WHERE id = ? AND workspace_id = ?'
    )
      .bind(name, phone, contactId, workspaceId)
      .run()
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return json({ error: 'A contact with that phone already exists' }, 409)
    }
    throw err
  }

  const contact = (await env.DB.prepare(
    'SELECT id, workspace_id, name, phone, created_at FROM contacts WHERE id = ? AND workspace_id = ?'
  )
    .bind(contactId, workspaceId)
    .first()) as ContactRow | null

  if (!contact) return json({ error: 'Contact not found' }, 404)

  await linkConversationContact(env, workspaceId, contact)

  await broadcast(env, workspaceId, { type: 'contact:update', contact })

  return json({ contact })
}

async function handleDeleteContact(env: Env, workspaceId: string, contactId: string) {
  const contact = (await env.DB.prepare(
    'SELECT id, workspace_id, name, phone, created_at FROM contacts WHERE id = ? AND workspace_id = ?'
  )
    .bind(contactId, workspaceId)
    .first()) as ContactRow | null

  await env.DB.prepare('DELETE FROM contacts WHERE id = ? AND workspace_id = ?')
    .bind(contactId, workspaceId)
    .run()

  if (contact) {
    await env.DB.prepare(
      'UPDATE conversations SET contact_id = NULL WHERE workspace_id = ? AND phone = ?'
    )
      .bind(workspaceId, contact.phone)
      .run()
    await broadcast(env, workspaceId, { type: 'contact:update', contact, deleted: true })
  }

  return json({ ok: true })
}

async function ensureConversation(env: Env, workspaceId: string, phone: string) {
  let conversation = (await env.DB.prepare(
    'SELECT id, workspace_id, contact_id, phone, last_message_at, unread_count, created_at FROM conversations WHERE workspace_id = ? AND phone = ?'
  )
    .bind(workspaceId, phone)
    .first()) as ConversationRow | null

  const contact = (await env.DB.prepare(
    'SELECT id, workspace_id, name, phone, created_at FROM contacts WHERE workspace_id = ? AND phone = ?'
  )
    .bind(workspaceId, phone)
    .first()) as ContactRow | null

  if (!conversation) {
    const id = crypto.randomUUID()
    const createdAt = Date.now()
    await env.DB.prepare(
      'INSERT INTO conversations (id, workspace_id, contact_id, phone, last_message_at, unread_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(id, workspaceId, contact?.id ?? null, phone, createdAt, 0, createdAt)
      .run()

    conversation = {
      id,
      workspace_id: workspaceId,
      contact_id: contact?.id ?? null,
      phone,
      last_message_at: createdAt,
      unread_count: 0,
      created_at: createdAt,
    }
  } else if (contact && conversation.contact_id !== contact.id) {
    await env.DB.prepare('UPDATE conversations SET contact_id = ? WHERE id = ?')
      .bind(contact.id, conversation.id)
      .run()
    conversation.contact_id = contact.id
  }

  return { conversation, contact }
}

async function createMessage(
  env: Env,
  workspaceId: string,
  opts: {
    conversationId: string
    direction: 'in' | 'out'
    fromPhone: string
    toPhone: string
    body: string
  }
) {
  const id = crypto.randomUUID()
  const createdAt = Date.now()
  const providerId = crypto.randomUUID()

  await env.DB.prepare(
    `
    INSERT INTO messages (id, workspace_id, conversation_id, direction, from_phone, to_phone, body, created_at, provider_message_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  )
    .bind(
      id,
      workspaceId,
      opts.conversationId,
      opts.direction,
      opts.fromPhone,
      opts.toPhone,
      opts.body,
      createdAt,
      providerId,
      'sent'
    )
    .run()

  const message: MessageRow = {
    id,
    workspace_id: workspaceId,
    conversation_id: opts.conversationId,
    direction: opts.direction,
    from_phone: opts.fromPhone,
    to_phone: opts.toPhone,
    body: opts.body,
    created_at: createdAt,
    provider_message_id: providerId,
    status: 'sent',
  }

  return message
}

async function touchConversation(
  env: Env,
  workspaceId: string,
  conversationId: string,
  opts: { lastMessageAt: number; incrementUnread: boolean }
) {
  await env.DB.prepare(
    `
    UPDATE conversations
    SET last_message_at = ?,
        unread_count = CASE WHEN ? THEN unread_count + 1 ELSE unread_count END
    WHERE id = ? AND workspace_id = ?
  `
  )
    .bind(opts.lastMessageAt, opts.incrementUnread ? 1 : 0, conversationId, workspaceId)
    .run()

  const conversation = (await env.DB.prepare(
    `
    SELECT
      c.id,
      c.workspace_id,
      c.contact_id,
      c.phone,
      c.last_message_at,
      c.unread_count,
      c.created_at,
      ct.name as contact_name,
      (
        SELECT body FROM messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) as last_message_body,
      (
        SELECT direction FROM messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) as last_message_direction
    FROM conversations c
    LEFT JOIN contacts ct ON c.contact_id = ct.id
    WHERE c.id = ? AND c.workspace_id = ?
  `
  )
    .bind(conversationId, workspaceId)
    .first()) as ConversationRow

  return conversation
}

async function linkConversationContact(env: Env, workspaceId: string, contact: ContactRow) {
  await env.DB.prepare(
    'UPDATE conversations SET contact_id = ? WHERE workspace_id = ? AND phone = ?'
  )
    .bind(contact.id, workspaceId, contact.phone)
    .run()

  const conversation = (await env.DB.prepare(
    `
    SELECT
      c.id,
      c.workspace_id,
      c.contact_id,
      c.phone,
      c.last_message_at,
      c.unread_count,
      c.created_at,
      ct.name as contact_name,
      (
        SELECT body FROM messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) as last_message_body,
      (
        SELECT direction FROM messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) as last_message_direction
    FROM conversations c
    LEFT JOIN contacts ct ON c.contact_id = ct.id
    WHERE c.workspace_id = ? AND c.phone = ?
  `
  )
    .bind(workspaceId, contact.phone)
    .first()) as ConversationRow | null

  if (conversation) {
    await broadcast(env, workspaceId, { type: 'conversation:update', conversation })
  }
}

async function broadcast(env: Env, workspaceId: string, payload: RealtimeEvent) {
  const stub = getChatHubStub(env, workspaceId)
  await stub.fetch('https://chathub/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

function getChatHubStub(env: Env, workspaceId: string) {
  const id = env.CHATHUB.idFromName(workspaceId)
  return env.CHATHUB.get(id)
}

async function requireSession(request: Request, env: Env): Promise<SessionPayload | null> {
  const cookieHeader = request.headers.get('Cookie') || ''
  const sessionValue = parseCookie(cookieHeader, SESSION_COOKIE)
  if (!sessionValue) return null
  const payload = await verifySessionToken(sessionValue, env)
  if (!payload) return null
  return payload
}

function parseCookie(header: string, name: string) {
  const parts = header.split(/;\s*/)
  for (const part of parts) {
    const [key, ...rest] = part.split('=')
    if (key === name) {
      return rest.join('=')
    }
  }
  return null
}

async function createSessionToken(payload: SessionPayload, env: Env) {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload))
  const payloadB64 = base64UrlEncode(payloadBytes)
  const signature = await hmacSign(payloadB64, env)
  return `${payloadB64}.${signature}`
}

async function verifySessionToken(token: string, env: Env): Promise<SessionPayload | null> {
  const [payloadB64, signature] = token.split('.')
  if (!payloadB64 || !signature) return null

  const expected = await hmacSign(payloadB64, env)
  if (expected !== signature) return null

  const payloadBytes = base64UrlDecode(payloadB64)
  const payloadJson = new TextDecoder().decode(payloadBytes)
  let payload: SessionPayload
  try {
    payload = JSON.parse(payloadJson) as SessionPayload
  } catch {
    return null
  }

  if (!payload.exp || payload.exp * 1000 < Date.now()) return null
  return payload
}

async function hmacSign(value: string, env: Env) {
  if (!sessionKeyPromise) {
    sessionKeyPromise = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.SESSION_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
  }
  const key = await sessionKeyPromise
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return base64UrlEncode(new Uint8Array(signature))
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function base64UrlDecode(input: string) {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const padLength = (4 - (padded.length % 4)) % 4
  const base64 = padded + '='.repeat(padLength)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function makeSessionCookie(token: string, url: URL) {
  const secure = url.protocol === 'https:'
  const attributes = [
    `${SESSION_COOKIE}=${token}`,
    `Max-Age=${SESSION_TTL_SECONDS}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (secure) attributes.push('Secure')
  return attributes.join('; ')
}

function clearSessionCookie(url: URL) {
  const secure = url.protocol === 'https:'
  const attributes = [
    `${SESSION_COOKIE}=`,
    'Max-Age=0',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (secure) attributes.push('Secure')
  return attributes.join('; ')
}

async function readJson(request: Request) {
  try {
    return (await request.json()) as unknown
  } catch {
    return null
  }
}

function json(data: JsonValue, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  })
}

function asRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, JsonValue>
}

function isUniqueConstraintError(err: unknown) {
  return err instanceof Error && err.message.includes('UNIQUE')
}

function normalizePhone(input: string) {
  const cleaned = input.replace(/[^\d+]/g, '')
  if (cleaned.startsWith('+1')) {
    const digits = cleaned.slice(2)
    if (digits.length === 10) return `+1${digits}`
  }
  if (cleaned.startsWith('1') && cleaned.length === 11) {
    return `+${cleaned}`
  }
  const digitsOnly = cleaned.replace(/\D/g, '')
  if (digitsOnly.length === 10) return `+1${digitsOnly}`
  return null
}
