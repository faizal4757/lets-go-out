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

        // Basic validation (MVP level)
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

        const result = await env.DB.prepare(
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
          JSON.stringify({
            id: result.meta.last_row_id,
            host_user_id,
            title,
            description,
            outing_mode,
            activity_type,
            location,
            virtual_link,
            date_time,
            status: "open"
          }),
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
       FALLBACK
       ========================= */
    return new Response(
      JSON.stringify({ error: "Not Found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }
};
