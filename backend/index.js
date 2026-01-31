const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-User-Id"
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders
    }
  });

const errorResponse = (message, status = 500) =>
  json({ error: message }, status);

const getUserId = (request) => {
  const userId = request.headers.get("X-User-Id");
  if (!userId) {
    throw new Response(
      JSON.stringify({ error: "Missing X-User-Id header" }),
      { status: 401, headers: corsHeaders }
    );
  }
  return userId;
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* =========================
       CORS PREFLIGHT
       ========================= */
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    try {
      /* =========================
         HEALTH CHECK
         ========================= */
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ status: "ok" });
      }

      /* =========================
        GET ALL OUTINGS (FEED) ✅ AP-17
        ========================= */
      if (request.method === "GET" && url.pathname === "/outings") {
        const currentUser = getUserId(request);

        const result = await env.DB.prepare(`
          SELECT o.*
          FROM outings o
          LEFT JOIN interest_requests ir
            ON o.id = ir.outing_id
            AND ir.requester_user_id = ?

          WHERE
            COALESCE(o.is_closed, 0) = 0
            OR ir.requester_user_id IS NOT NULL
            OR o.host_user_id = ?

          ORDER BY o.created_at DESC
        `)
          .bind(currentUser, currentUser) // ✅ bind twice
          .all();

        return json(result.results);
      }

      /* =========================
         CREATE OUTING (HOST)
         ========================= */
      if (request.method === "POST" && url.pathname === "/outings") {
        const host_user_id = getUserId(request);
        const body = await request.json();

        // FRONTEND → BACKEND MAPPING (AP-2)
        const {
          title,
          activity_type,
          date_time,
          location
        } = body;

        // For MVP, we hardcode outing_mode
        const outing_mode = "in_person";

        if (!title || !activity_type || !date_time) {
          return errorResponse(
            "title, activity_type, and date_time are required",
            400
          );
        }

        await env.DB.prepare(`
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
        `)
          .bind(
            title,
            outing_mode,
            activity_type,
            location ?? null,
            date_time,
            host_user_id
          )
          .run();

        return json({ message: "Outing created" }, 201);
      }
      /* =========================
        CLOSE OUTING (HOST ONLY)  ✅ AP-17
        ========================= */
      if (
        request.method === "PATCH" &&
        url.pathname.startsWith("/outings/") &&
        url.pathname.endsWith("/close")
      ) {
        const host_user_id = getUserId(request);
        const outing_id = url.pathname.split("/")[2];

        // 1. Verify outing exists + belongs to host
        const outing = await env.DB.prepare(`
          SELECT * FROM outings
          WHERE id = ?
        `)
          .bind(outing_id)
          .first();

        if (!outing) {
          return errorResponse("Outing not found", 404);
        }

        if (outing.host_user_id !== host_user_id) {
          return errorResponse("Forbidden", 403);
        }

        // 2. Mark outing as closed
        await env.DB.prepare(`
          UPDATE outings
          SET is_closed = 1
          WHERE id = ?
        `)
          .bind(outing_id)
          .run();

        return json({ message: "Outing closed successfully" });
      }

      /* =========================
         GET INTEREST REQUESTS (HOST ONLY)
         ========================= */
      if (
        request.method === "GET" &&
        url.pathname.startsWith("/outings/") &&
        url.pathname.endsWith("/interest_requests")
      ) {
        const currentUser = getUserId(request);
        const outing_id = url.pathname.split("/")[2];

        const outing = await env.DB.prepare(`
          SELECT host_user_id
          FROM outings
          WHERE id = ?
        `)
          .bind(outing_id)
          .first();

        if (!outing) {
          return errorResponse("Outing not found", 404);
        }

        if (outing.host_user_id !== currentUser) {
          return errorResponse("Forbidden", 403);
        }

        const result = await env.DB.prepare(`
          SELECT *
          FROM interest_requests
          WHERE outing_id = ?
          ORDER BY created_at ASC
        `)
          .bind(outing_id)
          .all();

        return json(result.results);
      }

      /* =========================
         CREATE INTEREST REQUEST
         ========================= */
      if (request.method === "POST" && url.pathname === "/interest_requests") {
      const requester_user_id = getUserId(request);
      const body = await request.json();
      const { outing_id } = body;

      if (!outing_id) {
        return errorResponse("outing_id is required", 400);
      }

      // ✅ AP-17: Block interest if outing is closed
      const outing = await env.DB.prepare(`
        SELECT is_closed
        FROM outings
        WHERE id = ?
      `)
        .bind(outing_id)
        .first();

      if (!outing) {
        return errorResponse("Outing not found", 404);
      }

      if (outing.is_closed === 1) {
        return errorResponse(
          "Outing is closed. No new requests allowed.",
          400
        );
      }

        await env.DB.prepare(`
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
        `)
          .bind(outing_id, requester_user_id)
          .run();

        return json(
          { outing_id, requester_user_id, status: "pending" },
          201
        );
      }
      /* =========================
   GET MY INTEREST REQUESTS (GUEST)
   ========================= */
        if (request.method === "GET" && url.pathname === "/interest_requests") {
          const requester_user_id = getUserId(request);

          const result = await env.DB.prepare(`
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
          `)
            .bind(requester_user_id)
            .all();

          return json(result.results);
        }


      /* =========================
         ACCEPT / REJECT REQUEST
         ========================= */
      if (
        request.method === "PATCH" &&
        url.pathname.startsWith("/interest_requests/")
      ) {
        const currentUser = getUserId(request);
        const interest_request_id = url.pathname.split("/")[2];
        const body = await request.json();
        const { status } = body;

        if (!["accepted", "rejected"].includes(status)) {
          return errorResponse(
            "status must be 'accepted' or 'rejected'",
            400
          );
        }

        const result = await env.DB.prepare(`
          UPDATE interest_requests
          SET status = ?
          WHERE id = ?
            AND status = 'pending'
            AND outing_id IN (
              SELECT id
              FROM outings
              WHERE host_user_id = ?
            )
        `)
          .bind(status, interest_request_id, currentUser)
          .run();

        if (result.changes === 0) {
          return errorResponse(
            "Not found, forbidden, or already decided",
            409
          );
        }

        return json({ id: interest_request_id, status });
      }

      return errorResponse("Not Found", 404);
    } catch (err) {
      if (err instanceof Response) return err;
      return errorResponse("Internal Server Error", 500);
    }
  }
};
