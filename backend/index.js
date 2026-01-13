export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* =========================
       HEALTH CHECK
       ========================= */
    if (request.method === "GET" && url.pathname === "/health") {
      return new Response(
        JSON.stringify({ status: "ok" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    /* =========================
       GET ALL OUTINGS
       ========================= */
    if (request.method === "GET" && url.pathname === "/outings") {
      try {
        const result = await env.DB.prepare(
          `
          SELECT *
          FROM outings
          ORDER BY created_at DESC
          `
        ).all();

        return new Response(
          JSON.stringify(result.results),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: "Failed to fetch outings",
            details: err.message
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    }

    /* =========================
       GET INTEREST REQUESTS FOR AN OUTING (HOST VIEW)
       ========================= */
    if (
      request.method === "GET" &&
      url.pathname.startsWith("/outings/") &&
      url.pathname.endsWith("/interest_requests")
    ) {
      try {
        const parts = url.pathname.split("/");
        const outing_id = parts[2]; // /outings/{id}/interest_requests

        if (!outing_id) {
          return new Response(
            JSON.stringify({ error: "outing_id is required" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" }
            }
          );
        }

        const result = await env.DB.prepare(
          `
          SELECT *
          FROM interest_requests
          WHERE outing_id = ?
          ORDER BY created_at ASC
          `
        )
          .bind(outing_id)
          .all();

        return new Response(
          JSON.stringify(result.results),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: "Failed to fetch interest requests",
            details: err.message
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" }
          }
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
          return new Response(
            JSON.stringify({
              error:
                "host_user_id, title, outing_mode, activity_type, date_time are required"
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" }
            }
          );
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
            created_at
          )
          VALUES (
            lower(hex(randomblob(16))),
            ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now')
          )
          `
        )
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

        return new Response(
          JSON.stringify({ message: "Outing created" }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" }
          }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: "Failed to create outing",
            details: err.message
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" }
          }
        );
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
          return new Response(
            JSON.stringify({
              error: "outing_id and requester_user_id are required"
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" }
            }
          );
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
            ?, ?, ?, strftime('%s','now')
          )
          `
        )
          .bind(outing_id, requester_user_id, "pending")
          .run();

        return new Response(
          JSON.stringify({
            outing_id,
            requester_user_id,
            status: "pending"
          }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" }
          }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: "Failed to create interest request",
            details: err.message
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    }

    /* =========================
       FALLBACK
       ========================= */
    return new Response(
      JSON.stringify({ error: "Not Found" }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};
