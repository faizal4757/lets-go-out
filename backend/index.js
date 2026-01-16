const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });

const errorResponse = (message, status = 500, details = null) =>
  json(details ? { error: message, details } : { error: message }, status);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* =========================
       HEALTH CHECK
       ========================= */
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ status: "ok" });
    }

    /* =========================
       GET ALL OUTINGS
       ========================= */
    if (request.method === "GET" && url.pathname === "/outings") {
      try {
        const result = await env.DB.prepare(`
          SELECT *
          FROM outings
          ORDER BY created_at DESC
        `).all();

        return json(result.results);
      } catch (err) {
        return errorResponse("Failed to fetch outings", 500, err.message);
      }
    }

    /* =========================
       GET INTEREST REQUESTS (HOST VIEW)
       ========================= */
    if (
      request.method === "GET" &&
      url.pathname.startsWith("/outings/") &&
      url.pathname.endsWith("/interest_requests")
    ) {
      try {
        const outing_id = url.pathname.split("/")[2];

        const result = await env.DB.prepare(`
          SELECT *
          FROM interest_requests
          WHERE outing_id = ?
          ORDER BY created_at ASC
        `)
          .bind(outing_id)
          .all();

        return json(result.results);
      } catch (err) {
        return errorResponse(
          "Failed to fetch interest requests",
          500,
          err.message
        );
      }
    }

    /* =========================
       CREATE OUTING
       ========================= */
    if (request.method === "POST" && url.pathname === "/outings") {
      try {
        const body = await request.json();
        const {
          host_user_id,
          title,
          description,
          outing_mode,
          activity_type,
          location,
          virtual_link,
          date_time
        } = body;

        if (
          !host_user_id ||
          !title ||
          !outing_mode ||
          !activity_type ||
          !date_time
        ) {
          return errorResponse(
            "host_user_id, title, outing_mode, activity_type, date_time are required",
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
            created_at
          )
          VALUES (
            lower(hex(randomblob(16))),
            ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now')
          )
        `)
          .bind(
            title,
            description ?? null,
            outing_mode,
            activity_type,
            location ?? null,
            virtual_link ?? null,
            date_time,
            host_user_id,
            "open"
          )
          .run();

        return json({ message: "Outing created" }, 201);
      } catch (err) {
        return errorResponse("Failed to create outing", 500, err.message);
      }
    }

    /* =========================
       CREATE INTEREST REQUEST
       ========================= */
    if (request.method === "POST" && url.pathname === "/interest_requests") {
      try {
        const body = await request.json();
        const { outing_id, requester_user_id } = body;

        if (!outing_id || !requester_user_id) {
          return errorResponse(
            "outing_id and requester_user_id are required",
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
      } catch (err) {
        return errorResponse(
          "Failed to create interest request",
          500,
          err.message
        );
      }
    }

    /* =========================
       ACCEPT / REJECT INTEREST REQUEST
       ========================= */
    if (
      request.method === "PATCH" &&
      url.pathname.startsWith("/interest_requests/")
    ) {
      try {
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
        `)
          .bind(status, interest_request_id)
          .run();

        if (result.changes === 0) {
          return errorResponse(
            "Interest request not found or already decided",
            409
          );
        }

        return json({ id: interest_request_id, status });
      } catch (err) {
        return errorResponse(
          "Failed to update interest request",
          500,
          err.message
        );
      }
    }

    /* =========================
       FALLBACK
       ========================= */
    return errorResponse("Not Found", 404);
  }
};
