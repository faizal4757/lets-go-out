export async function onRequest({ env }) {
  const apiBaseUrl = env.API_BASE_URL || "https://lets-go-out.lets-go-out-api.workers.dev";
  return new Response(JSON.stringify({ apiBaseUrl }), {
    headers: {
      "Content-Type": "application/json"
    }
  });
}
