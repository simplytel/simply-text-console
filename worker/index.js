"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatHub = void 0;
var SESSION_COOKIE = 'tc_session';
var SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
var MAX_MESSAGE_LENGTH = 2000;
var MAX_NAME_LENGTH = 80;
var sessionKeyPromise = null;
exports.default = {
    fetch: function (request, env, ctx) {
        return __awaiter(this, void 0, void 0, function () {
            var url;
            return __generator(this, function (_a) {
                url = new URL(request.url);
                if (url.pathname.startsWith('/api/')) {
                    return [2 /*return*/, handleApi(request, env, ctx)];
                }
                if (env.ASSETS) {
                    return [2 /*return*/, env.ASSETS.fetch(request)];
                }
                return [2 /*return*/, new Response('Not found', { status: 404 })];
            });
        });
    },
};
var ChatHub = /** @class */ (function () {
    function ChatHub(state) {
        this.state = state;
    }
    ChatHub.prototype.fetch = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var url, pair, _a, client, server, payload;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        url = new URL(request.url);
                        if (request.headers.get('Upgrade') === 'websocket') {
                            pair = new WebSocketPair();
                            _a = Object.values(pair), client = _a[0], server = _a[1];
                            this.state.acceptWebSocket(server);
                            return [2 /*return*/, new Response(null, { status: 101, webSocket: client })];
                        }
                        if (!(url.pathname === '/broadcast' && request.method === 'POST')) return [3 /*break*/, 2];
                        return [4 /*yield*/, request.json()];
                    case 1:
                        payload = (_b.sent());
                        this.broadcast(payload);
                        return [2 /*return*/, json({ ok: true })];
                    case 2: return [2 /*return*/, new Response('Not found', { status: 404 })];
                }
            });
        });
    };
    ChatHub.prototype.broadcast = function (payload) {
        var message = JSON.stringify(payload);
        for (var _i = 0, _a = this.state.getWebSockets(); _i < _a.length; _i++) {
            var socket = _a[_i];
            try {
                socket.send(message);
            }
            catch (err) {
                socket.close(1011, 'Broadcast failed');
            }
        }
    };
    ChatHub.prototype.webSocketMessage = function (ws, message) {
        if (typeof message === 'string' && message === 'ping') {
            ws.send('pong');
        }
    };
    return ChatHub;
}());
exports.ChatHub = ChatHub;
function handleApi(request, env, ctx) {
    return __awaiter(this, void 0, void 0, function () {
        var url, pathname, session_1, session, stub, path, parts;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    url = new URL(request.url);
                    pathname = url.pathname;
                    if (isStateChanging(request) && !isSameOrigin(request)) {
                        return [2 /*return*/, json({ error: 'Invalid origin' }, 403)];
                    }
                    if (pathname === '/api/login' && request.method === 'POST') {
                        return [2 /*return*/, handleLogin(request, env)];
                    }
                    if (pathname === '/api/logout' && request.method === 'POST') {
                        return [2 /*return*/, handleLogout(request)];
                    }
                    if (!(pathname === '/api/me' && request.method === 'GET')) return [3 /*break*/, 2];
                    return [4 /*yield*/, requireSession(request, env)];
                case 1:
                    session_1 = _a.sent();
                    if (!session_1)
                        return [2 /*return*/, json({ error: 'Unauthorized' }, 401)];
                    return [2 /*return*/, json({ user: { id: session_1.sub, workspace_id: session_1.ws, display_name: session_1.dn } })];
                case 2: return [4 /*yield*/, requireSession(request, env)];
                case 3:
                    session = _a.sent();
                    if (!session)
                        return [2 /*return*/, json({ error: 'Unauthorized' }, 401)];
                    if (pathname === '/api/ws') {
                        if (request.headers.get('Upgrade') !== 'websocket') {
                            return [2 /*return*/, json({ error: 'Expected websocket upgrade' }, 400)];
                        }
                        stub = getChatHubStub(env, session.ws);
                        return [2 /*return*/, stub.fetch(request)];
                    }
                    path = pathname.replace(/^\/api\/?/, '');
                    parts = path.split('/').filter(Boolean);
                    if (parts[0] === 'conversations' && request.method === 'GET' && parts.length === 1) {
                        return [2 /*return*/, handleListConversations(env, session.ws)];
                    }
                    if (parts[0] === 'conversations' && parts.length === 3 && parts[2] === 'read') {
                        if (request.method === 'POST') {
                            return [2 /*return*/, handleReadConversation(env, session.ws, parts[1])];
                        }
                    }
                    if (parts[0] === 'conversations' && parts.length === 3 && parts[2] === 'messages') {
                        if (request.method === 'GET') {
                            return [2 /*return*/, handleListMessages(env, session.ws, parts[1], url)];
                        }
                    }
                    if (parts[0] === 'messages' && parts[1] === 'send' && request.method === 'POST') {
                        return [2 /*return*/, handleSendMessage(request, env, session.ws)];
                    }
                    if (parts[0] === 'dev' && parts[1] === 'inbound' && request.method === 'POST') {
                        if (env.DEV_MODE !== 'true') {
                            return [2 /*return*/, json({ error: 'Dev endpoint disabled' }, 403)];
                        }
                        return [2 /*return*/, handleDevInbound(request, env, session.ws)];
                    }
                    if (parts[0] === 'contacts' && parts.length === 1) {
                        if (request.method === 'GET') {
                            return [2 /*return*/, handleListContacts(env, session.ws)];
                        }
                        if (request.method === 'POST') {
                            return [2 /*return*/, handleCreateContact(request, env, session.ws)];
                        }
                    }
                    if (parts[0] === 'contacts' && parts.length === 2 && parts[1]) {
                        if (request.method === 'PUT') {
                            return [2 /*return*/, handleUpdateContact(request, env, session.ws, parts[1])];
                        }
                        if (request.method === 'DELETE') {
                            return [2 /*return*/, handleDeleteContact(env, session.ws, parts[1])];
                        }
                    }
                    return [2 /*return*/, json({ error: 'Not found' }, 404)];
            }
        });
    });
}
function isStateChanging(request) {
    return !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
}
function isSameOrigin(request) {
    var origin = request.headers.get('Origin');
    if (!origin)
        return true;
    try {
        var url = new URL(request.url);
        return origin === url.origin;
    }
    catch (_a) {
        return false;
    }
}
function handleLogin(request, env) {
    return __awaiter(this, void 0, void 0, function () {
        var body, workspaceCode, pin, displayName, workspaceId, user, id, createdAt, token, cookie;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, readJson(request)];
                case 1:
                    body = _d.sent();
                    if (!body)
                        return [2 /*return*/, json({ error: 'Invalid JSON' }, 400)];
                    workspaceCode = String((_a = body.workspaceCode) !== null && _a !== void 0 ? _a : '').trim();
                    pin = String((_b = body.pin) !== null && _b !== void 0 ? _b : '').trim();
                    displayName = String((_c = body.displayName) !== null && _c !== void 0 ? _c : '').trim();
                    if (!workspaceCode || !pin || !displayName) {
                        return [2 /*return*/, json({ error: 'Missing fields' }, 400)];
                    }
                    if (displayName.length > MAX_NAME_LENGTH) {
                        return [2 /*return*/, json({ error: 'Display name too long' }, 400)];
                    }
                    if (workspaceCode !== env.APP_WORKSPACE_CODE || pin !== env.APP_SHARED_PIN) {
                        return [2 /*return*/, json({ error: 'Invalid workspace code or PIN' }, 401)];
                    }
                    workspaceId = workspaceCode;
                    return [4 /*yield*/, env.DB.prepare('SELECT id, workspace_id, display_name, created_at FROM users WHERE workspace_id = ? AND display_name = ?')
                            .bind(workspaceId, displayName)
                            .first()];
                case 2:
                    user = (_d.sent());
                    if (!!user) return [3 /*break*/, 4];
                    id = crypto.randomUUID();
                    createdAt = Date.now();
                    return [4 /*yield*/, env.DB.prepare('INSERT INTO users (id, workspace_id, display_name, created_at) VALUES (?, ?, ?, ?)')
                            .bind(id, workspaceId, displayName, createdAt)
                            .run()];
                case 3:
                    _d.sent();
                    user = { id: id, workspace_id: workspaceId, display_name: displayName, created_at: createdAt };
                    _d.label = 4;
                case 4: return [4 /*yield*/, createSessionToken({
                        sub: user.id,
                        ws: workspaceId,
                        dn: user.display_name,
                        exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
                    }, env)];
                case 5:
                    token = _d.sent();
                    cookie = makeSessionCookie(token, new URL(request.url));
                    return [2 /*return*/, json({ user: user }, 200, {
                            'Set-Cookie': cookie,
                        })];
            }
        });
    });
}
function handleLogout(request) {
    return __awaiter(this, void 0, void 0, function () {
        var cookie;
        return __generator(this, function (_a) {
            cookie = clearSessionCookie(new URL(request.url));
            return [2 /*return*/, json({ ok: true }, 200, { 'Set-Cookie': cookie })];
        });
    });
}
function handleListConversations(env, workspaceId) {
    return __awaiter(this, void 0, void 0, function () {
        var stmt, results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    stmt = env.DB.prepare("\n    SELECT\n      c.id,\n      c.workspace_id,\n      c.contact_id,\n      c.phone,\n      c.last_message_at,\n      c.unread_count,\n      c.created_at,\n      ct.name as contact_name,\n      (\n        SELECT body FROM messages m\n        WHERE m.conversation_id = c.id\n        ORDER BY m.created_at DESC\n        LIMIT 1\n      ) as last_message_body,\n      (\n        SELECT direction FROM messages m\n        WHERE m.conversation_id = c.id\n        ORDER BY m.created_at DESC\n        LIMIT 1\n      ) as last_message_direction\n    FROM conversations c\n    LEFT JOIN contacts ct ON c.contact_id = ct.id\n    WHERE c.workspace_id = ?\n    ORDER BY c.last_message_at IS NULL, c.last_message_at DESC, c.created_at DESC\n  ").bind(workspaceId);
                    return [4 /*yield*/, stmt.all()];
                case 1:
                    results = (_a.sent()).results;
                    return [2 /*return*/, json({ conversations: results })];
            }
        });
    });
}
function handleListMessages(env, workspaceId, conversationId, url) {
    return __awaiter(this, void 0, void 0, function () {
        var limit, beforeRaw, before, stmt, results, messages;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    limit = Math.min(Math.max(Number((_a = url.searchParams.get('limit')) !== null && _a !== void 0 ? _a : '100'), 1), 200);
                    beforeRaw = url.searchParams.get('before');
                    before = beforeRaw ? Number(beforeRaw) : null;
                    if (before) {
                        stmt = env.DB.prepare("\n      SELECT id, workspace_id, conversation_id, direction, from_phone, to_phone, body, created_at, provider_message_id, status\n      FROM messages\n      WHERE workspace_id = ? AND conversation_id = ? AND created_at < ?\n      ORDER BY created_at DESC\n      LIMIT ?\n    ").bind(workspaceId, conversationId, before, limit);
                    }
                    else {
                        stmt = env.DB.prepare("\n      SELECT id, workspace_id, conversation_id, direction, from_phone, to_phone, body, created_at, provider_message_id, status\n      FROM messages\n      WHERE workspace_id = ? AND conversation_id = ?\n      ORDER BY created_at DESC\n      LIMIT ?\n    ").bind(workspaceId, conversationId, limit);
                    }
                    return [4 /*yield*/, stmt.all()];
                case 1:
                    results = (_b.sent()).results;
                    messages = results.slice().reverse();
                    return [2 /*return*/, json({ messages: messages })];
            }
        });
    });
}
function handleReadConversation(env, workspaceId, conversationId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, env.DB.prepare('UPDATE conversations SET unread_count = 0 WHERE id = ? AND workspace_id = ?')
                        .bind(conversationId, workspaceId)
                        .run()];
                case 1:
                    _a.sent();
                    return [2 /*return*/, json({ ok: true })];
            }
        });
    });
}
function handleSendMessage(request, env, workspaceId) {
    return __awaiter(this, void 0, void 0, function () {
        var body, rawPhone, messageBody, toPhone, _a, conversation, contact, message, updatedConversation, event;
        var _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, readJson(request)];
                case 1:
                    body = _e.sent();
                    if (!body)
                        return [2 /*return*/, json({ error: 'Invalid JSON' }, 400)];
                    rawPhone = String((_b = body.toPhone) !== null && _b !== void 0 ? _b : '').trim();
                    messageBody = String((_c = body.body) !== null && _c !== void 0 ? _c : '').trim();
                    if (!rawPhone || !messageBody) {
                        return [2 /*return*/, json({ error: 'Missing phone or body' }, 400)];
                    }
                    if (messageBody.length > MAX_MESSAGE_LENGTH) {
                        return [2 /*return*/, json({ error: 'Message too long' }, 400)];
                    }
                    toPhone = normalizePhone(rawPhone);
                    if (!toPhone)
                        return [2 /*return*/, json({ error: 'Invalid phone' }, 400)];
                    return [4 /*yield*/, ensureConversation(env, workspaceId, toPhone)];
                case 2:
                    _a = _e.sent(), conversation = _a.conversation, contact = _a.contact;
                    return [4 /*yield*/, createMessage(env, workspaceId, {
                            conversationId: conversation.id,
                            direction: 'out',
                            fromPhone: '+1SIMULATED',
                            toPhone: toPhone,
                            body: messageBody,
                        })];
                case 3:
                    message = _e.sent();
                    return [4 /*yield*/, touchConversation(env, workspaceId, conversation.id, {
                            lastMessageAt: message.created_at,
                            incrementUnread: false,
                        })];
                case 4:
                    updatedConversation = _e.sent();
                    event = {
                        type: 'message:new',
                        conversationId: conversation.id,
                        conversation: __assign(__assign({}, updatedConversation), { contact_name: (_d = contact === null || contact === void 0 ? void 0 : contact.name) !== null && _d !== void 0 ? _d : updatedConversation.contact_name }),
                        message: message,
                    };
                    return [4 /*yield*/, broadcast(env, workspaceId, event)];
                case 5:
                    _e.sent();
                    return [2 /*return*/, json({ conversation: event.conversation, message: message })];
            }
        });
    });
}
function handleDevInbound(request, env, workspaceId) {
    return __awaiter(this, void 0, void 0, function () {
        var body, rawPhone, messageBody, fromPhone, _a, conversation, contact, message, updatedConversation, event;
        var _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, readJson(request)];
                case 1:
                    body = _e.sent();
                    if (!body)
                        return [2 /*return*/, json({ error: 'Invalid JSON' }, 400)];
                    rawPhone = String((_b = body.fromPhone) !== null && _b !== void 0 ? _b : '').trim();
                    messageBody = String((_c = body.body) !== null && _c !== void 0 ? _c : '').trim();
                    if (!rawPhone || !messageBody) {
                        return [2 /*return*/, json({ error: 'Missing phone or body' }, 400)];
                    }
                    if (messageBody.length > MAX_MESSAGE_LENGTH) {
                        return [2 /*return*/, json({ error: 'Message too long' }, 400)];
                    }
                    fromPhone = normalizePhone(rawPhone);
                    if (!fromPhone)
                        return [2 /*return*/, json({ error: 'Invalid phone' }, 400)];
                    return [4 /*yield*/, ensureConversation(env, workspaceId, fromPhone)];
                case 2:
                    _a = _e.sent(), conversation = _a.conversation, contact = _a.contact;
                    return [4 /*yield*/, createMessage(env, workspaceId, {
                            conversationId: conversation.id,
                            direction: 'in',
                            fromPhone: fromPhone,
                            toPhone: '+1SIMULATED',
                            body: messageBody,
                        })];
                case 3:
                    message = _e.sent();
                    return [4 /*yield*/, touchConversation(env, workspaceId, conversation.id, {
                            lastMessageAt: message.created_at,
                            incrementUnread: true,
                        })];
                case 4:
                    updatedConversation = _e.sent();
                    event = {
                        type: 'message:new',
                        conversationId: conversation.id,
                        conversation: __assign(__assign({}, updatedConversation), { contact_name: (_d = contact === null || contact === void 0 ? void 0 : contact.name) !== null && _d !== void 0 ? _d : updatedConversation.contact_name }),
                        message: message,
                    };
                    return [4 /*yield*/, broadcast(env, workspaceId, event)];
                case 5:
                    _e.sent();
                    return [2 /*return*/, json({ conversation: event.conversation, message: message })];
            }
        });
    });
}
function handleListContacts(env, workspaceId) {
    return __awaiter(this, void 0, void 0, function () {
        var stmt, results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    stmt = env.DB.prepare('SELECT id, workspace_id, name, phone, created_at FROM contacts WHERE workspace_id = ? ORDER BY name ASC').bind(workspaceId);
                    return [4 /*yield*/, stmt.all()];
                case 1:
                    results = (_a.sent()).results;
                    return [2 /*return*/, json({ contacts: results })];
            }
        });
    });
}
function handleCreateContact(request, env, workspaceId) {
    return __awaiter(this, void 0, void 0, function () {
        var body, name, rawPhone, phone, id, createdAt, err_1, contact;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, readJson(request)];
                case 1:
                    body = _c.sent();
                    if (!body)
                        return [2 /*return*/, json({ error: 'Invalid JSON' }, 400)];
                    name = String((_a = body.name) !== null && _a !== void 0 ? _a : '').trim();
                    rawPhone = String((_b = body.phone) !== null && _b !== void 0 ? _b : '').trim();
                    if (!name || !rawPhone) {
                        return [2 /*return*/, json({ error: 'Missing name or phone' }, 400)];
                    }
                    if (name.length > MAX_NAME_LENGTH) {
                        return [2 /*return*/, json({ error: 'Name too long' }, 400)];
                    }
                    phone = normalizePhone(rawPhone);
                    if (!phone)
                        return [2 /*return*/, json({ error: 'Invalid phone' }, 400)];
                    id = crypto.randomUUID();
                    createdAt = Date.now();
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, env.DB.prepare('INSERT INTO contacts (id, workspace_id, name, phone, created_at) VALUES (?, ?, ?, ?, ?)')
                            .bind(id, workspaceId, name, phone, createdAt)
                            .run()];
                case 3:
                    _c.sent();
                    return [3 /*break*/, 5];
                case 4:
                    err_1 = _c.sent();
                    if (isUniqueConstraintError(err_1)) {
                        return [2 /*return*/, json({ error: 'A contact with that phone already exists' }, 409)];
                    }
                    throw err_1;
                case 5:
                    contact = { id: id, workspace_id: workspaceId, name: name, phone: phone, created_at: createdAt };
                    return [4 /*yield*/, linkConversationContact(env, workspaceId, contact)];
                case 6:
                    _c.sent();
                    return [4 /*yield*/, broadcast(env, workspaceId, { type: 'contact:update', contact: contact })];
                case 7:
                    _c.sent();
                    return [2 /*return*/, json({ contact: contact })];
            }
        });
    });
}
function handleUpdateContact(request, env, workspaceId, contactId) {
    return __awaiter(this, void 0, void 0, function () {
        var body, name, rawPhone, phone, err_2, contact;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, readJson(request)];
                case 1:
                    body = _c.sent();
                    if (!body)
                        return [2 /*return*/, json({ error: 'Invalid JSON' }, 400)];
                    name = String((_a = body.name) !== null && _a !== void 0 ? _a : '').trim();
                    rawPhone = String((_b = body.phone) !== null && _b !== void 0 ? _b : '').trim();
                    if (!name || !rawPhone) {
                        return [2 /*return*/, json({ error: 'Missing name or phone' }, 400)];
                    }
                    if (name.length > MAX_NAME_LENGTH) {
                        return [2 /*return*/, json({ error: 'Name too long' }, 400)];
                    }
                    phone = normalizePhone(rawPhone);
                    if (!phone)
                        return [2 /*return*/, json({ error: 'Invalid phone' }, 400)];
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, env.DB.prepare('UPDATE contacts SET name = ?, phone = ? WHERE id = ? AND workspace_id = ?')
                            .bind(name, phone, contactId, workspaceId)
                            .run()];
                case 3:
                    _c.sent();
                    return [3 /*break*/, 5];
                case 4:
                    err_2 = _c.sent();
                    if (isUniqueConstraintError(err_2)) {
                        return [2 /*return*/, json({ error: 'A contact with that phone already exists' }, 409)];
                    }
                    throw err_2;
                case 5: return [4 /*yield*/, env.DB.prepare('SELECT id, workspace_id, name, phone, created_at FROM contacts WHERE id = ? AND workspace_id = ?')
                        .bind(contactId, workspaceId)
                        .first()];
                case 6:
                    contact = (_c.sent());
                    if (!contact)
                        return [2 /*return*/, json({ error: 'Contact not found' }, 404)];
                    return [4 /*yield*/, linkConversationContact(env, workspaceId, contact)];
                case 7:
                    _c.sent();
                    return [4 /*yield*/, broadcast(env, workspaceId, { type: 'contact:update', contact: contact })];
                case 8:
                    _c.sent();
                    return [2 /*return*/, json({ contact: contact })];
            }
        });
    });
}
function handleDeleteContact(env, workspaceId, contactId) {
    return __awaiter(this, void 0, void 0, function () {
        var contact;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, env.DB.prepare('SELECT id, workspace_id, name, phone, created_at FROM contacts WHERE id = ? AND workspace_id = ?')
                        .bind(contactId, workspaceId)
                        .first()];
                case 1:
                    contact = (_a.sent());
                    return [4 /*yield*/, env.DB.prepare('DELETE FROM contacts WHERE id = ? AND workspace_id = ?')
                            .bind(contactId, workspaceId)
                            .run()];
                case 2:
                    _a.sent();
                    if (!contact) return [3 /*break*/, 5];
                    return [4 /*yield*/, env.DB.prepare('UPDATE conversations SET contact_id = NULL WHERE workspace_id = ? AND phone = ?')
                            .bind(workspaceId, contact.phone)
                            .run()];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, broadcast(env, workspaceId, { type: 'contact:update', contact: contact, deleted: true })];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5: return [2 /*return*/, json({ ok: true })];
            }
        });
    });
}
function ensureConversation(env, workspaceId, phone) {
    return __awaiter(this, void 0, void 0, function () {
        var conversation, contact, id, createdAt;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, env.DB.prepare('SELECT id, workspace_id, contact_id, phone, last_message_at, unread_count, created_at FROM conversations WHERE workspace_id = ? AND phone = ?')
                        .bind(workspaceId, phone)
                        .first()];
                case 1:
                    conversation = (_c.sent());
                    return [4 /*yield*/, env.DB.prepare('SELECT id, workspace_id, name, phone, created_at FROM contacts WHERE workspace_id = ? AND phone = ?')
                            .bind(workspaceId, phone)
                            .first()];
                case 2:
                    contact = (_c.sent());
                    if (!!conversation) return [3 /*break*/, 4];
                    id = crypto.randomUUID();
                    createdAt = Date.now();
                    return [4 /*yield*/, env.DB.prepare('INSERT INTO conversations (id, workspace_id, contact_id, phone, last_message_at, unread_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
                            .bind(id, workspaceId, (_a = contact === null || contact === void 0 ? void 0 : contact.id) !== null && _a !== void 0 ? _a : null, phone, createdAt, 0, createdAt)
                            .run()];
                case 3:
                    _c.sent();
                    conversation = {
                        id: id,
                        workspace_id: workspaceId,
                        contact_id: (_b = contact === null || contact === void 0 ? void 0 : contact.id) !== null && _b !== void 0 ? _b : null,
                        phone: phone,
                        last_message_at: createdAt,
                        unread_count: 0,
                        created_at: createdAt,
                    };
                    return [3 /*break*/, 6];
                case 4:
                    if (!(contact && conversation.contact_id !== contact.id)) return [3 /*break*/, 6];
                    return [4 /*yield*/, env.DB.prepare('UPDATE conversations SET contact_id = ? WHERE id = ?')
                            .bind(contact.id, conversation.id)
                            .run()];
                case 5:
                    _c.sent();
                    conversation.contact_id = contact.id;
                    _c.label = 6;
                case 6: return [2 /*return*/, { conversation: conversation, contact: contact }];
            }
        });
    });
}
function createMessage(env, workspaceId, opts) {
    return __awaiter(this, void 0, void 0, function () {
        var id, createdAt, providerId, message;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    id = crypto.randomUUID();
                    createdAt = Date.now();
                    providerId = crypto.randomUUID();
                    return [4 /*yield*/, env.DB.prepare("\n    INSERT INTO messages (id, workspace_id, conversation_id, direction, from_phone, to_phone, body, created_at, provider_message_id, status)\n    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n  ")
                            .bind(id, workspaceId, opts.conversationId, opts.direction, opts.fromPhone, opts.toPhone, opts.body, createdAt, providerId, 'sent')
                            .run()];
                case 1:
                    _a.sent();
                    message = {
                        id: id,
                        workspace_id: workspaceId,
                        conversation_id: opts.conversationId,
                        direction: opts.direction,
                        from_phone: opts.fromPhone,
                        to_phone: opts.toPhone,
                        body: opts.body,
                        created_at: createdAt,
                        provider_message_id: providerId,
                        status: 'sent',
                    };
                    return [2 /*return*/, message];
            }
        });
    });
}
function touchConversation(env, workspaceId, conversationId, opts) {
    return __awaiter(this, void 0, void 0, function () {
        var conversation;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, env.DB.prepare("\n    UPDATE conversations\n    SET last_message_at = ?,\n        unread_count = CASE WHEN ? THEN unread_count + 1 ELSE unread_count END\n    WHERE id = ? AND workspace_id = ?\n  ")
                        .bind(opts.lastMessageAt, opts.incrementUnread ? 1 : 0, conversationId, workspaceId)
                        .run()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, env.DB.prepare("\n    SELECT\n      c.id,\n      c.workspace_id,\n      c.contact_id,\n      c.phone,\n      c.last_message_at,\n      c.unread_count,\n      c.created_at,\n      ct.name as contact_name,\n      (\n        SELECT body FROM messages m\n        WHERE m.conversation_id = c.id\n        ORDER BY m.created_at DESC\n        LIMIT 1\n      ) as last_message_body,\n      (\n        SELECT direction FROM messages m\n        WHERE m.conversation_id = c.id\n        ORDER BY m.created_at DESC\n        LIMIT 1\n      ) as last_message_direction\n    FROM conversations c\n    LEFT JOIN contacts ct ON c.contact_id = ct.id\n    WHERE c.id = ? AND c.workspace_id = ?\n  ")
                            .bind(conversationId, workspaceId)
                            .first()];
                case 2:
                    conversation = (_a.sent());
                    return [2 /*return*/, conversation];
            }
        });
    });
}
function linkConversationContact(env, workspaceId, contact) {
    return __awaiter(this, void 0, void 0, function () {
        var conversation;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, env.DB.prepare('UPDATE conversations SET contact_id = ? WHERE workspace_id = ? AND phone = ?')
                        .bind(contact.id, workspaceId, contact.phone)
                        .run()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, env.DB.prepare("\n    SELECT\n      c.id,\n      c.workspace_id,\n      c.contact_id,\n      c.phone,\n      c.last_message_at,\n      c.unread_count,\n      c.created_at,\n      ct.name as contact_name,\n      (\n        SELECT body FROM messages m\n        WHERE m.conversation_id = c.id\n        ORDER BY m.created_at DESC\n        LIMIT 1\n      ) as last_message_body,\n      (\n        SELECT direction FROM messages m\n        WHERE m.conversation_id = c.id\n        ORDER BY m.created_at DESC\n        LIMIT 1\n      ) as last_message_direction\n    FROM conversations c\n    LEFT JOIN contacts ct ON c.contact_id = ct.id\n    WHERE c.workspace_id = ? AND c.phone = ?\n  ")
                            .bind(workspaceId, contact.phone)
                            .first()];
                case 2:
                    conversation = (_a.sent());
                    if (!conversation) return [3 /*break*/, 4];
                    return [4 /*yield*/, broadcast(env, workspaceId, { type: 'conversation:update', conversation: conversation })];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    });
}
function broadcast(env, workspaceId, payload) {
    return __awaiter(this, void 0, void 0, function () {
        var stub;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    stub = getChatHubStub(env, workspaceId);
                    return [4 /*yield*/, stub.fetch('https://chathub/broadcast', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                        })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function getChatHubStub(env, workspaceId) {
    var id = env.CHATHUB.idFromName(workspaceId);
    return env.CHATHUB.get(id);
}
function requireSession(request, env) {
    return __awaiter(this, void 0, void 0, function () {
        var cookieHeader, sessionValue, payload;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    cookieHeader = request.headers.get('Cookie') || '';
                    sessionValue = parseCookie(cookieHeader, SESSION_COOKIE);
                    if (!sessionValue)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, verifySessionToken(sessionValue, env)];
                case 1:
                    payload = _a.sent();
                    if (!payload)
                        return [2 /*return*/, null];
                    return [2 /*return*/, payload];
            }
        });
    });
}
function parseCookie(header, name) {
    var parts = header.split(/;\s*/);
    for (var _i = 0, parts_1 = parts; _i < parts_1.length; _i++) {
        var part = parts_1[_i];
        var _a = part.split('='), key = _a[0], rest = _a.slice(1);
        if (key === name) {
            return rest.join('=');
        }
    }
    return null;
}
function createSessionToken(payload, env) {
    return __awaiter(this, void 0, void 0, function () {
        var payloadBytes, payloadB64, signature;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
                    payloadB64 = base64UrlEncode(payloadBytes);
                    return [4 /*yield*/, hmacSign(payloadB64, env)];
                case 1:
                    signature = _a.sent();
                    return [2 /*return*/, "".concat(payloadB64, ".").concat(signature)];
            }
        });
    });
}
function verifySessionToken(token, env) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, payloadB64, signature, expected, payloadBytes, payloadJson, payload;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _a = token.split('.'), payloadB64 = _a[0], signature = _a[1];
                    if (!payloadB64 || !signature)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, hmacSign(payloadB64, env)];
                case 1:
                    expected = _b.sent();
                    if (expected !== signature)
                        return [2 /*return*/, null];
                    payloadBytes = base64UrlDecode(payloadB64);
                    payloadJson = new TextDecoder().decode(payloadBytes);
                    try {
                        payload = JSON.parse(payloadJson);
                    }
                    catch (_c) {
                        return [2 /*return*/, null];
                    }
                    if (!payload.exp || payload.exp * 1000 < Date.now())
                        return [2 /*return*/, null];
                    return [2 /*return*/, payload];
            }
        });
    });
}
function hmacSign(value, env) {
    return __awaiter(this, void 0, void 0, function () {
        var key, signature;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!sessionKeyPromise) {
                        sessionKeyPromise = crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
                    }
                    return [4 /*yield*/, sessionKeyPromise];
                case 1:
                    key = _a.sent();
                    return [4 /*yield*/, crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))];
                case 2:
                    signature = _a.sent();
                    return [2 /*return*/, base64UrlEncode(new Uint8Array(signature))];
            }
        });
    });
}
function base64UrlEncode(bytes) {
    var binary = '';
    bytes.forEach(function (b) {
        binary += String.fromCharCode(b);
    });
    return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function base64UrlDecode(input) {
    var padded = input.replace(/-/g, '+').replace(/_/g, '/');
    var padLength = (4 - (padded.length % 4)) % 4;
    var base64 = padded + '='.repeat(padLength);
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
function makeSessionCookie(token, url) {
    var secure = url.protocol === 'https:';
    var attributes = [
        "".concat(SESSION_COOKIE, "=").concat(token),
        "Max-Age=".concat(SESSION_TTL_SECONDS),
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
    ];
    if (secure)
        attributes.push('Secure');
    return attributes.join('; ');
}
function clearSessionCookie(url) {
    var secure = url.protocol === 'https:';
    var attributes = [
        "".concat(SESSION_COOKIE, "="),
        'Max-Age=0',
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
    ];
    if (secure)
        attributes.push('Secure');
    return attributes.join('; ');
}
function readJson(request) {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, request.json()];
                case 1: return [2 /*return*/, (_b.sent())];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function json(data, status, headers) {
    if (status === void 0) { status = 200; }
    if (headers === void 0) { headers = {}; }
    return new Response(JSON.stringify(data), {
        status: status,
        headers: __assign({ 'Content-Type': 'application/json' }, headers),
    });
}
function isUniqueConstraintError(err) {
    return err instanceof Error && err.message.includes('UNIQUE');
}
function normalizePhone(input) {
    var cleaned = input.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+1')) {
        var digits = cleaned.slice(2);
        if (digits.length === 10)
            return "+1".concat(digits);
    }
    if (cleaned.startsWith('1') && cleaned.length === 11) {
        return "+".concat(cleaned);
    }
    var digitsOnly = cleaned.replace(/\D/g, '');
    if (digitsOnly.length === 10)
        return "+1".concat(digitsOnly);
    return null;
}
