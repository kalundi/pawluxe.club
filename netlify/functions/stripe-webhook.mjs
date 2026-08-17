import { createHmac, timingSafeEqual } from "node:crypto";

const SUPABASE_URL = "https://cszqmwjkbbrhswdzgoop.supabase.co";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function validStripeSignature(rawBody, signatureHeader, secret) {
  const parts = Object.fromEntries(signatureHeader.split(",").map((part) => part.split("=")));
  if (!parts.t || !parts.v1) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(parts.t));
  if (!Number.isFinite(age) || age > 300) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(parts.v1);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const webhookSecret = Netlify.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseSecret = Netlify.env.get("SUPABASE_SECRET_KEY") || Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!webhookSecret || !supabaseSecret) return json({ error: "Webhook is not configured." }, 503);

  const rawBody = await request.text();
  if (!validStripeSignature(rawBody, request.headers.get("stripe-signature") || "", webhookSecret)) {
    return json({ error: "Invalid signature." }, 400);
  }
  const event = JSON.parse(rawBody);
  const session = event.data?.object;
  const rpc = event.type === "checkout.session.completed"
    ? "finalize_reward_redemption"
    : event.type === "checkout.session.expired"
      ? "release_reward_redemption"
      : null;
  if (rpc && session?.id && Number(session.metadata?.reward_points || 0) > 0) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
      method: "POST",
      headers: { apikey: supabaseSecret, authorization: `Bearer ${supabaseSecret}`, "content-type": "application/json" },
      body: JSON.stringify({ p_session_id: session.id }),
    });
    if (!response.ok) {
      console.error("Rewards webhook RPC failed", await response.text());
      return json({ error: "Rewards update failed." }, 500);
    }
  }
  return json({ received: true });
};

export const config = { path: "/api/stripe-webhook" };
