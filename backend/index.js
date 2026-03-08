const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Expose-Headers": "X-Session-Expires-At"
};

const SESSION_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const sseEncoder = new TextEncoder();
const sseClients = new Map();

const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...extraHeaders
    }
  });

const errorResponse = (message, status = 500) => json({ error: message }, status);

const sseEventPayload = (event, data) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const broadcastSse = (event, data) => {
  if (sseClients.size === 0) {
    return;
  }

  const payload = sseEncoder.encode(sseEventPayload(event, data));
  for (const [clientId, client] of sseClients.entries()) {
    try {
      client.controller.enqueue(payload);
    } catch (_err) {
      if (client.pingTimerId) {
        clearInterval(client.pingTimerId);
      }
      sseClients.delete(clientId);
    }
  }
};

const notifyOutingsUpdated = (reason, details = {}) => {
  broadcastSse("outings-updated", {
    reason,
    timestamp: nowUnix(),
    ...details
  });
};

const isValidEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isValidPassword = (password) =>
  typeof password === "string" && password.length >= 8;

const normalizeOptionalText = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
};

const normalizeAge = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 120) {
    return null;
  }

  return parsed;
};

const userPayload = (user) => ({
  id: user.id,
  email: user.email,
  display_name: user.display_name,
  age: user.age ?? null,
  likes: user.likes ?? null,
  dislikes: user.dislikes ?? null,
  interests: user.interests ?? null,
  is_active: user.is_active === undefined ? true : Number(user.is_active) === 1
});

const toHex = (bytes) =>
  Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");

const hashPassword = async (password) => {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(password)
  );
  return toHex(new Uint8Array(buffer));
};

const ensureUsersSchema = async (db) => {
  const usersTable = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'"
  ).first();

  if (!usersTable) {
    await db.prepare(
      `
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          display_name TEXT NOT NULL,
          age INTEGER,
          likes TEXT,
          dislikes TEXT,
          interests TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          deactivated_at INTEGER,
          created_at INTEGER NOT NULL
        )
      `
    ).run();
    return;
  }

  const tableInfo = await db.prepare("PRAGMA table_info(users)").all();
  const columns = new Set(tableInfo.results.map((col) => col.name));

  if (!columns.has("email")) {
    await db.prepare("ALTER TABLE users ADD COLUMN email TEXT").run();
  }

  if (!columns.has("password_hash")) {
    await db.prepare("ALTER TABLE users ADD COLUMN password_hash TEXT").run();
  }

  if (!columns.has("display_name")) {
    await db.prepare("ALTER TABLE users ADD COLUMN display_name TEXT").run();
  }

  if (!columns.has("created_at")) {
    await db.prepare("ALTER TABLE users ADD COLUMN created_at INTEGER").run();
  }

  if (!columns.has("age")) {
    await db.prepare("ALTER TABLE users ADD COLUMN age INTEGER").run();
  }

  if (!columns.has("likes")) {
    await db.prepare("ALTER TABLE users ADD COLUMN likes TEXT").run();
  }

  if (!columns.has("dislikes")) {
    await db.prepare("ALTER TABLE users ADD COLUMN dislikes TEXT").run();
  }

  if (!columns.has("interests")) {
    await db.prepare("ALTER TABLE users ADD COLUMN interests TEXT").run();
  }

  if (!columns.has("is_active")) {
    await db.prepare("ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1").run();
  }

  if (!columns.has("deactivated_at")) {
    await db.prepare("ALTER TABLE users ADD COLUMN deactivated_at INTEGER").run();
  }

  await db.prepare(
    "UPDATE users SET email = lower(id) || '@legacy.local' WHERE email IS NULL OR trim(email) = ''"
  ).run();
  await db.prepare(
    "UPDATE users SET password_hash = '' WHERE password_hash IS NULL"
  ).run();
  await db.prepare(
    "UPDATE users SET display_name = CASE WHEN email LIKE '%@%' THEN substr(email, 1, instr(email, '@') - 1) ELSE id END WHERE display_name IS NULL OR trim(display_name) = ''"
  ).run();
  await db.prepare(
    "UPDATE users SET created_at = strftime('%s','now') WHERE created_at IS NULL"
  ).run();
  await db.prepare(
    "UPDATE users SET is_active = 1 WHERE is_active IS NULL"
  ).run();
  await db.prepare(
    "UPDATE users SET deactivated_at = NULL WHERE is_active = 1"
  ).run();
  await db.prepare(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)"
  ).run();
  await db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active)"
  ).run();
};

const ensureSessionsSchema = async (db) => {
  const sessionsTable = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'"
  ).first();

  if (!sessionsTable) {
    await db.prepare(
      `
        CREATE TABLE sessions (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `
    ).run();
  }

  await db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)"
  ).run();
  await db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)"
  ).run();
};

const ensureOutingsSchema = async (db) => {
  const outingsTable = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'outings'"
  ).first();

  if (!outingsTable) {
    await db.prepare(
      `
        CREATE TABLE outings (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          outing_mode TEXT NOT NULL,
          activity_type TEXT NOT NULL,
          location TEXT,
          virtual_link TEXT,
          date_time INTEGER NOT NULL,
          host_user_id TEXT NOT NULL,
          status TEXT NOT NULL,
          is_closed INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (host_user_id) REFERENCES users(id)
        )
      `
    ).run();
  } else {
    const tableInfo = await db.prepare("PRAGMA table_info(outings)").all();
    const columns = new Set(tableInfo.results.map((col) => col.name));

    if (!columns.has("is_closed")) {
      await db.prepare("ALTER TABLE outings ADD COLUMN is_closed INTEGER DEFAULT 0").run();
    }
  }

  await db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_outings_host_user_id ON outings(host_user_id)"
  ).run();
  await db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_outings_created_at ON outings(created_at)"
  ).run();
  await db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_outings_is_closed ON outings(is_closed)"
  ).run();
};

const ensureInterestRequestsSchema = async (db) => {
  try {
    await db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_interest_requests_outing_id ON interest_requests(outing_id)"
    ).run();
    await db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_interest_requests_requester ON interest_requests(requester_user_id)"
    ).run();
    await db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_interest_requests_status ON interest_requests(status)"
    ).run();
  } catch (_err) {
    // Indexes may already exist, that's okay
  }
};

const ensureDeletedIdentitiesSchema = async (db) => {
  const deletedIdentitiesTable = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'deleted_identities'"
  ).first();

  if (!deletedIdentitiesTable) {
    await db.prepare(
      `
        CREATE TABLE deleted_identities (
          email TEXT PRIMARY KEY,
          deleted_at INTEGER NOT NULL
        )
      `
    ).run();
  }

  await db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_deleted_identities_deleted_at ON deleted_identities(deleted_at)"
  ).run();
};

let schemaInitialized = false;
const ensureSchema = async (db) => {
  if (schemaInitialized) return;
  await ensureUsersSchema(db);
  await ensureSessionsSchema(db);
  await ensureOutingsSchema(db);
  await ensureInterestRequestsSchema(db);
  await ensureDeletedIdentitiesSchema(db);
  schemaInitialized = true;
};

const cleanupExpiredSessions = async (db) => {
  const now = nowUnix();
  await db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now - 3600).run();
};

const nowUnix = () => Math.floor(Date.now() / 1000);

const sessionHeaders = (expiresAt) =>
  expiresAt ? { "X-Session-Expires-At": String(expiresAt) } : {};

const createSession = async (db, userId) => {
  const token = crypto.randomUUID().replace(/-/g, "");
  const createdAt = nowUnix();
  const expiresAt = createdAt + SESSION_TTL_SECONDS;

  await db.prepare(
    `
      INSERT INTO sessions (token, user_id, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `
  )
    .bind(token, userId, expiresAt, createdAt)
    .run();

  return { token, expires_at: expiresAt };
};

const getSessionToken = (request) => {
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  return token || null;
};

const getAuthenticatedUser = async (request, db) => {
  const token = getSessionToken(request);
  if (!token) {
    throw new Response(JSON.stringify({ error: "Missing session token" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }

  const session = await db.prepare(
    `
      SELECT s.user_id, s.expires_at, u.email, u.display_name, u.age, u.likes, u.dislikes, u.interests, u.is_active
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ?
    `
  )
    .bind(token)
    .first();

  if (!session) {
    throw new Response(JSON.stringify({ error: "Invalid session token" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }

  if (session.expires_at <= nowUnix()) {
    await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    throw new Response(JSON.stringify({ error: "Session expired" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }

  const isActive = Number(session.is_active ?? 1) === 1;
  if (!isActive) {
    await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    throw new Response(JSON.stringify({ error: "Account is inactive. Please log in again to reactivate." }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }

  const refreshedExpiresAt = nowUnix() + SESSION_TTL_SECONDS;
  await db.prepare("UPDATE sessions SET expires_at = ? WHERE token = ?")
    .bind(refreshedExpiresAt, token)
    .run();

  return {
    user: {
      id: session.user_id,
      email: session.email,
      display_name: session.display_name,
      age: session.age ?? null,
      likes: session.likes ?? null,
      dislikes: session.dislikes ?? null,
      interests: session.interests ?? null,
      is_active: true
    },
    token,
    expires_at: refreshedExpiresAt
  };
};

const getAuthenticatedUserFromToken = async (token, db) => {
  if (!token) {
    throw new Response(JSON.stringify({ error: "Missing session token" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }

  const session = await db.prepare(
    `
      SELECT s.user_id, s.expires_at, u.email, u.display_name, u.age, u.likes, u.dislikes, u.interests, u.is_active
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ?
    `
  )
    .bind(token)
    .first();

  if (!session) {
    throw new Response(JSON.stringify({ error: "Invalid session token" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }

  if (session.expires_at <= nowUnix()) {
    await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    throw new Response(JSON.stringify({ error: "Session expired" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }

  const isActive = Number(session.is_active ?? 1) === 1;
  if (!isActive) {
    await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    throw new Response(JSON.stringify({ error: "Account is inactive. Please log in again to reactivate." }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }

  const refreshedExpiresAt = nowUnix() + SESSION_TTL_SECONDS;
  await db.prepare("UPDATE sessions SET expires_at = ? WHERE token = ?")
    .bind(refreshedExpiresAt, token)
    .run();

  return {
    user: {
      id: session.user_id,
      email: session.email,
      display_name: session.display_name,
      age: session.age ?? null,
      likes: session.likes ?? null,
      dislikes: session.dislikes ?? null,
      interests: session.interests ?? null,
      is_active: true
    },
    token,
    expires_at: refreshedExpiresAt
  };
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ status: "ok" });
      }

      // Initialize schema once per worker instance
      await ensureSchema(env.DB);

      if (request.method === "GET" && url.pathname === "/events") {
        const token = String(url.searchParams.get("token") || "").trim();
        const auth = await getAuthenticatedUserFromToken(token, env.DB);
        const clientId = crypto.randomUUID();

        const stream = new ReadableStream({
          start(controller) {
            const pingTimerId = setInterval(() => {
              try {
                controller.enqueue(sseEncoder.encode(": ping\n\n"));
              } catch (_err) {
                clearInterval(pingTimerId);
                sseClients.delete(clientId);
              }
            }, 15000);

            sseClients.set(clientId, {
              controller,
              userId: auth.user.id,
              pingTimerId
            });

            controller.enqueue(
              sseEncoder.encode(
                sseEventPayload("connected", {
                  user_id: auth.user.id,
                  timestamp: nowUnix()
                })
              )
            );
          },
          cancel() {
            const client = sseClients.get(clientId);
            if (client?.pingTimerId) {
              clearInterval(client.pingTimerId);
            }
            sseClients.delete(clientId);
          }
        });

        return new Response(stream, {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive"
          }
        });
      }

      if (request.method === "POST" && url.pathname === "/auth/signup") {

        const body = await request.json();
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        const display_name = String(body.display_name || "").trim();

        if (!email || !password) {
          return errorResponse("email and password are required", 400);
        }

        if (!isValidEmail(email)) {
          return errorResponse("Please enter a valid email address", 400);
        }

        if (!isValidPassword(password)) {
          return errorResponse("Password must be at least 8 characters", 400);
        }

        const existing = await env.DB.prepare(
          "SELECT id FROM users WHERE email = ?"
        )
          .bind(email)
          .first();

        if (existing) {
          return errorResponse("An account with this email already exists", 409);
        }

        const password_hash = await hashPassword(password);
        const userId = crypto.randomUUID().replace(/-/g, "");
        const safeDisplayName = display_name || email.split("@")[0];

        await env.DB.prepare(
          `
            INSERT INTO users (id, email, password_hash, display_name, age, likes, dislikes, interests, created_at)
            VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, strftime('%s','now'))
          `
        )
          .bind(userId, email, password_hash, safeDisplayName)
          .run();

        const session = await createSession(env.DB, userId);

        return json(
          {
            user: userPayload({
              id: userId,
              email,
              display_name: safeDisplayName
            }),
            token: session.token,
            expires_at: session.expires_at
          },
          201
        );
      }

      if (request.method === "POST" && url.pathname === "/auth/login") {
        const body = await request.json();
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

        if (!email || !password) {
          return errorResponse("email and password are required", 400);
        }

        const user = await env.DB.prepare(
          `
            SELECT id, email, password_hash, display_name, age, likes, dislikes, interests, is_active
            FROM users
            WHERE email = ?
          `
        )
          .bind(email)
          .first();

        if (!user) {
          return errorResponse("Invalid email or password", 401);
        }

        const submittedHash = await hashPassword(password);
        if (submittedHash !== user.password_hash) {
          return errorResponse("Invalid email or password", 401);
        }

        if (Number(user.is_active ?? 1) !== 1) {
          await env.DB.prepare(
            "UPDATE users SET is_active = 1, deactivated_at = NULL WHERE id = ?"
          )
            .bind(user.id)
            .run();
          user.is_active = 1;
        }

        const session = await createSession(env.DB, user.id);

        return json({
          user: userPayload(user),
          token: session.token,
          expires_at: session.expires_at
        });
      }

      if (request.method === "GET" && url.pathname === "/auth/session") {
        const auth = await getAuthenticatedUser(request, env.DB);

        return json(
          {
            user: auth.user,
            token: auth.token,
            expires_at: auth.expires_at
          },
          200,
          sessionHeaders(auth.expires_at)
        );
      }

      if (request.method === "POST" && url.pathname === "/auth/logout") {
        const token = getSessionToken(request);

        if (token) {
          await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
        }

        return json({ message: "Logged out" });
      }

      if (request.method === "GET" && url.pathname === "/profile") {
        const auth = await getAuthenticatedUser(request, env.DB);

        return json({ user: auth.user }, 200, sessionHeaders(auth.expires_at));
      }

      if (request.method === "PATCH" && url.pathname === "/profile") {
        const auth = await getAuthenticatedUser(request, env.DB);
        const body = await request.json();

        const nextDisplayName = normalizeOptionalText(body.display_name);
        const nextAge = normalizeAge(body.age);
        const nextLikes = normalizeOptionalText(body.likes);
        const nextDislikes = normalizeOptionalText(body.dislikes);
        const nextInterests = normalizeOptionalText(body.interests);

        if (body.display_name !== undefined && !nextDisplayName) {
          return errorResponse("display_name cannot be empty", 400);
        }

        if (body.age !== undefined && body.age !== null && body.age !== "" && nextAge === null) {
          return errorResponse("age must be a whole number between 0 and 120", 400);
        }

        const shouldUpdateDisplayName = body.display_name !== undefined;
        const shouldUpdateAge = body.age !== undefined;
        const shouldUpdateLikes = body.likes !== undefined;
        const shouldUpdateDislikes = body.dislikes !== undefined;
        const shouldUpdateInterests = body.interests !== undefined;

        await env.DB.prepare(
          `
            UPDATE users
            SET
              display_name = CASE WHEN ? THEN ? ELSE display_name END,
              age = CASE WHEN ? THEN ? ELSE age END,
              likes = CASE WHEN ? THEN ? ELSE likes END,
              dislikes = CASE WHEN ? THEN ? ELSE dislikes END,
              interests = CASE WHEN ? THEN ? ELSE interests END
            WHERE id = ?
          `
        )
          .bind(
            shouldUpdateDisplayName ? 1 : 0,
            nextDisplayName,
            shouldUpdateAge ? 1 : 0,
            nextAge,
            shouldUpdateLikes ? 1 : 0,
            nextLikes,
            shouldUpdateDislikes ? 1 : 0,
            nextDislikes,
            shouldUpdateInterests ? 1 : 0,
            nextInterests,
            auth.user.id
          )
          .run();

        const updatedUser = await env.DB.prepare(
          `
            SELECT id, email, display_name, age, likes, dislikes, interests
            FROM users
            WHERE id = ?
          `
        )
          .bind(auth.user.id)
          .first();

        return json({ user: userPayload(updatedUser) }, 200, sessionHeaders(auth.expires_at));
      }

      if (request.method === "DELETE" && url.pathname === "/profile") {
        const auth = await getAuthenticatedUser(request, env.DB);
        const userId = auth.user.id;
        const deletedAt = nowUnix();

        // Delete all user's sessions
        await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?")
          .bind(userId)
          .run();

        // Mark user as inactive; requests remain visible to hosts.
        await env.DB.prepare(
          "UPDATE users SET is_active = 0, deactivated_at = ? WHERE id = ?"
        )
          .bind(deletedAt, userId)
          .run();

        // Close user's hosted outings so no new activity can be created while inactive.
        await env.DB.prepare("UPDATE outings SET is_closed = 1 WHERE host_user_id = ?")
          .bind(userId)
          .run();

        return json({ message: "Account deactivated" });
      }

      if (
        request.method === "GET" &&
        url.pathname.startsWith("/users/") &&
        url.pathname.endsWith("/profile")
      ) {
        const auth = await getAuthenticatedUser(request, env.DB);
        const targetUserId = url.pathname.split("/")[2];

        const user = await env.DB.prepare(
          `
            SELECT id, email, display_name, age, likes, dislikes, interests, is_active
            FROM users
            WHERE id = ?
          `
        )
          .bind(targetUserId)
          .first();

        if (!user) {
          return errorResponse("User not found", 404);
        }

        if (Number(user.is_active ?? 1) !== 1) {
          return errorResponse("User is no longer active", 404);
        }

        return json({ user: userPayload(user) }, 200, sessionHeaders(auth.expires_at));
      }

      if (request.method === "GET" && url.pathname === "/outings") {
        const auth = await getAuthenticatedUser(request, env.DB);
        const currentUser = auth.user.id;

        try {
          const result = await env.DB.prepare(
            `
              SELECT o.*, u.display_name AS host_display_name
              FROM outings o
              JOIN users u ON u.id = o.host_user_id
              LEFT JOIN interest_requests ir
                ON o.id = ir.outing_id
                AND ir.requester_user_id = ?
              WHERE
                COALESCE(o.is_closed, 0) = 0
                OR ir.requester_user_id IS NOT NULL
                OR o.host_user_id = ?
              ORDER BY o.created_at DESC
            `
          )
            .bind(currentUser, currentUser)
            .all();

          return json(result.results || [], 200, sessionHeaders(auth.expires_at));
        } catch (err) {
          console.error("Error fetching outings:", err);
          return errorResponse("Failed to fetch outings: " + (err.message || "unknown error"), 500);
        }
      }

      if (request.method === "POST" && url.pathname === "/outings") {
        const auth = await getAuthenticatedUser(request, env.DB);
        const host_user_id = auth.user.id;
        const body = await request.json();

        const { title, activity_type, date_time, location } = body;
        const outing_mode = "in_person";

        if (!title || !activity_type || !date_time) {
          return errorResponse("title, activity_type, and date_time are required", 400);
        }

        await env.DB.prepare(
          `
            INSERT INTO outings (
              id,
              title,
              description,
              outing_mode,
              activity_type,
              location,
              virtual_link,
              date_time,
              host_user_id,
              status,
              is_closed,
              created_at
            )
            VALUES (
              lower(hex(randomblob(16))),
              ?, NULL, ?, ?, ?, NULL, ?, ?, 'open', 0, strftime('%s','now')
            )
          `
        )
          .bind(title, outing_mode, activity_type, location ?? null, date_time, host_user_id)
          .run();

        notifyOutingsUpdated("outing-created", {
          host_user_id
        });

        return json({ message: "Outing created" }, 201, sessionHeaders(auth.expires_at));
      }

      if (
        request.method === "PATCH" &&
        url.pathname.startsWith("/outings/") &&
        url.pathname.split("/").filter(Boolean).length === 2
      ) {
        const auth = await getAuthenticatedUser(request, env.DB);
        const host_user_id = auth.user.id;
        const outing_id = url.pathname.split("/")[2];
        const body = await request.json();

        const nextTitle = body.title === undefined ? undefined : String(body.title).trim();
        const nextActivityType =
          body.activity_type === undefined ? undefined : String(body.activity_type).trim();
        const nextDateTime =
          body.date_time === undefined ? undefined : Number(body.date_time);
        const nextLocation =
          body.location === undefined ? undefined : normalizeOptionalText(body.location);

        const hasAtLeastOneField =
          body.title !== undefined ||
          body.activity_type !== undefined ||
          body.date_time !== undefined ||
          body.location !== undefined;

        if (!hasAtLeastOneField) {
          return errorResponse("At least one editable field is required", 400);
        }

        if (body.title !== undefined && !nextTitle) {
          return errorResponse("title cannot be empty", 400);
        }

        if (body.activity_type !== undefined && !nextActivityType) {
          return errorResponse("activity_type cannot be empty", 400);
        }

        if (
          body.date_time !== undefined &&
          (!Number.isFinite(nextDateTime) || !Number.isInteger(nextDateTime) || nextDateTime <= 0)
        ) {
          return errorResponse("date_time must be a valid Unix timestamp", 400);
        }

        const outing = await env.DB.prepare(
          "SELECT id, host_user_id, is_closed FROM outings WHERE id = ?"
        )
          .bind(outing_id)
          .first();

        if (!outing) {
          return errorResponse("Outing not found", 404);
        }

        if (outing.host_user_id !== host_user_id) {
          return errorResponse("Forbidden", 403);
        }

        if (outing.is_closed === 1) {
          return errorResponse("Closed outings cannot be edited", 409);
        }

        const interestCount = await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM interest_requests WHERE outing_id = ?"
        )
          .bind(outing_id)
          .first();

        if (Number(interestCount?.count || 0) > 0) {
          return errorResponse(
            "This outing cannot be edited because it already has interest requests. Delete this outing and create a new one.",
            409
          );
        }

        const shouldUpdateTitle = body.title !== undefined;
        const shouldUpdateActivityType = body.activity_type !== undefined;
        const shouldUpdateDateTime = body.date_time !== undefined;
        const shouldUpdateLocation = body.location !== undefined;

        await env.DB.prepare(
          `
            UPDATE outings
            SET
              title = CASE WHEN ? THEN ? ELSE title END,
              activity_type = CASE WHEN ? THEN ? ELSE activity_type END,
              date_time = CASE WHEN ? THEN ? ELSE date_time END,
              location = CASE WHEN ? THEN ? ELSE location END
            WHERE id = ?
          `
        )
          .bind(
            shouldUpdateTitle ? 1 : 0,
            nextTitle,
            shouldUpdateActivityType ? 1 : 0,
            nextActivityType,
            shouldUpdateDateTime ? 1 : 0,
            nextDateTime,
            shouldUpdateLocation ? 1 : 0,
            nextLocation,
            outing_id
          )
          .run();

        notifyOutingsUpdated("outing-updated", {
          outing_id,
          host_user_id
        });

        const updatedOuting = await env.DB.prepare(
          `
            SELECT o.*, u.display_name AS host_display_name
            FROM outings o
            JOIN users u ON u.id = o.host_user_id
            WHERE o.id = ?
          `
        )
          .bind(outing_id)
          .first();

        return json(
          { message: "Outing updated successfully", outing: updatedOuting },
          200,
          sessionHeaders(auth.expires_at)
        );
      }

      if (
        request.method === "PATCH" &&
        url.pathname.startsWith("/outings/") &&
        url.pathname.endsWith("/close")
      ) {
        const auth = await getAuthenticatedUser(request, env.DB);
        const host_user_id = auth.user.id;
        const outing_id = url.pathname.split("/")[2];

        const outing = await env.DB.prepare(
          "SELECT * FROM outings WHERE id = ?"
        )
          .bind(outing_id)
          .first();

        if (!outing) {
          return errorResponse("Outing not found", 404);
        }

        if (outing.host_user_id !== host_user_id) {
          return errorResponse("Forbidden", 403);
        }

        await env.DB.prepare(
          "UPDATE outings SET is_closed = 1 WHERE id = ?"
        )
          .bind(outing_id)
          .run();

        notifyOutingsUpdated("outing-closed", {
          outing_id,
          host_user_id
        });

        return json({ message: "Outing closed successfully" }, 200, sessionHeaders(auth.expires_at));
      }

      if (
        request.method === "GET" &&
        url.pathname.startsWith("/outings/") &&
        url.pathname.endsWith("/interest_requests")
      ) {
        const auth = await getAuthenticatedUser(request, env.DB);
        const currentUser = auth.user.id;
        const outing_id = url.pathname.split("/")[2];

        const outing = await env.DB.prepare(
          "SELECT host_user_id FROM outings WHERE id = ?"
        )
          .bind(outing_id)
          .first();

        if (!outing) {
          return errorResponse("Outing not found", 404);
        }

        if (outing.host_user_id !== currentUser) {
          return errorResponse("Forbidden", 403);
        }

        const result = await env.DB.prepare(
          `
            SELECT
              ir.id,
              ir.outing_id,
              ir.requester_user_id,
              ir.status,
              ir.created_at,
              COALESCE(u.is_active, 0) AS requester_is_active
            FROM interest_requests ir
            LEFT JOIN users u ON u.id = ir.requester_user_id
            WHERE ir.outing_id = ?
            ORDER BY ir.created_at ASC
          `
        )
          .bind(outing_id)
          .all();

        const payload = (result.results || []).map((row) => {
          const isRequesterActive = Number(row.requester_is_active) === 1;
          return {
            ...row,
            requester_is_active: isRequesterActive,
            inactive_message: isRequesterActive
              ? null
              : "This user is no longer active in the system."
          };
        });

        return json(payload, 200, sessionHeaders(auth.expires_at));
      }

      if (request.method === "POST" && url.pathname === "/interest_requests") {
        const auth = await getAuthenticatedUser(request, env.DB);
        const requester_user_id = auth.user.id;
        const body = await request.json();
        const { outing_id } = body;

        if (!outing_id) {
          return errorResponse("outing_id is required", 400);
        }

        const outing = await env.DB.prepare(
          "SELECT is_closed FROM outings WHERE id = ?"
        )
          .bind(outing_id)
          .first();

        if (!outing) {
          return errorResponse("Outing not found", 404);
        }

        if (outing.is_closed === 1) {
          return errorResponse("Outing is closed. No new requests allowed.", 400);
        }

        await env.DB.prepare(
          `
            INSERT INTO interest_requests (
              id,
              outing_id,
              requester_user_id,
              status,
              created_at
            )
            VALUES (
              lower(hex(randomblob(16))),
              ?, ?, 'pending', strftime('%s','now')
            )
          `
        )
          .bind(outing_id, requester_user_id)
          .run();

        notifyOutingsUpdated("interest-expressed", {
          outing_id,
          requester_user_id
        });

        return json(
          { outing_id, requester_user_id, status: "pending" },
          201,
          sessionHeaders(auth.expires_at)
        );
      }

      if (request.method === "GET" && url.pathname === "/interest_requests") {
        const auth = await getAuthenticatedUser(request, env.DB);
        const requester_user_id = auth.user.id;

        try {
          const result = await env.DB.prepare(
            `
              SELECT
                ir.id,
                ir.outing_id,
                ir.status,
                ir.created_at,
                o.title,
                o.activity_type,
                o.date_time,
                o.location,
                o.is_closed
              FROM interest_requests ir
              JOIN outings o ON ir.outing_id = o.id
              WHERE ir.requester_user_id = ?
              ORDER BY ir.created_at DESC
            `
          )
            .bind(requester_user_id)
            .all();

          return json(result.results || [], 200, sessionHeaders(auth.expires_at));
        } catch (err) {
          console.error("Error fetching interest requests:", err);
          return errorResponse(
            "Failed to fetch interest requests: " + (err?.message || "unknown error"),
            500
          );
        }
      }

      if (
        request.method === "PATCH" &&
        url.pathname.startsWith("/interest_requests/")
      ) {
        const auth = await getAuthenticatedUser(request, env.DB);
        const currentUser = auth.user.id;
        const interest_request_id = url.pathname.split("/")[2];
        const body = await request.json();
        const { status } = body;

        if (!["accepted", "rejected"].includes(status)) {
          return errorResponse("status must be 'accepted' or 'rejected'", 400);
        }

        const requestRecord = await env.DB.prepare(
          `
            SELECT
              ir.id,
              ir.outing_id,
              ir.status,
              ir.requester_user_id,
              o.host_user_id,
              COALESCE(u.is_active, 0) AS requester_is_active
            FROM interest_requests ir
            JOIN outings o ON o.id = ir.outing_id
            LEFT JOIN users u ON u.id = ir.requester_user_id
            WHERE ir.id = ?
          `
        )
          .bind(interest_request_id)
          .first();

        if (!requestRecord || requestRecord.host_user_id !== currentUser) {
          return errorResponse("Not found, forbidden, or already decided", 409);
        }

        if (requestRecord.status !== "pending") {
          return errorResponse("Not found, forbidden, or already decided", 409);
        }

        if (Number(requestRecord.requester_is_active) !== 1) {
          return errorResponse("Cannot update request because the user is no longer active.", 409);
        }

        const result = await env.DB.prepare(
          `
            UPDATE interest_requests
            SET status = ?
            WHERE id = ?
              AND status = 'pending'
              AND outing_id IN (
                SELECT id
                FROM outings
                WHERE host_user_id = ?
              )
          `
        )
          .bind(status, interest_request_id, currentUser)
          .run();

        if (result.changes === 0) {
          return errorResponse("Not found, forbidden, or already decided", 409);
        }

        notifyOutingsUpdated("interest-status-updated", {
          interest_request_id,
          outing_id: requestRecord.outing_id,
          requester_user_id: requestRecord.requester_user_id,
          host_user_id: currentUser,
          status
        });

        return json({ id: interest_request_id, status }, 200, sessionHeaders(auth.expires_at));
      }

      return errorResponse("Not Found", 404);
    } catch (err) {
      if (err instanceof Response) {
        return err;
      }
      console.error("Unhandled error:", err);
      return errorResponse(
        "Internal Server Error: " + (err?.message || "unknown error"),
        500
      );
    }
  }
};
