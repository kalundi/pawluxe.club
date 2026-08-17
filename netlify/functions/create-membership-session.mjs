const SUPABASE_URL = "https://cszqmwjkbbrhswdzgoop.supabase.co";
const SUPABASE_KEY = "sb_publishable_waTH6kOiQPcctaK1SAeVlQ_hVHASK8w";
const MEMBERSHIPS = Object.freeze({
  plus: { name: "Pawluxe Plus", price: "price_1U5VfTP0o9BjdOwSfPqdLtT1" },
  vip: { name: "Pawluxe VIP", price: "price_1U5VY9P0o9BjdOwS4Y6d5etF" },
});

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8" },
});

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Please sign in before choosing a paid membership." }, 401);

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` },
  });
  if (!userResponse.ok) return json({ error: "Your sign-in has expired. Please sign in again." }, 401);
  const user = await userResponse.json();
  if (!user.email) return json({ error: "A verified email address is required." }, 400);

  const entitlementResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/member_entitlements?select=tier&email=eq.${encodeURIComponent(user.email.toLowerCase())}&limit=1`,
    { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` } },
  );
  if (!entitlementResponse.ok) return json({ error: "Membership could not be verified. Please try again." }, 502);
  const [entitlement] = await entitlementResponse.json();
  if (entitlement?.tier) return json({ error: `This account already has an active Pawluxe ${entitlement.tier === "vip" ? "VIP" : "Plus"} membership.` }, 409);

  const { tier } = await request.json().catch(() => ({}));
  const membership = MEMBERSHIPS[tier];
  if (!membership) return json({ error: "Unknown membership option." }, 400);

  const stripeSecretKey = Netlify.env.get("STRIPE_SECRET_KEY");
  if (!stripeSecretKey) return json({ error: "Membership checkout is not configured." }, 503);
  const origin = new URL(request.url).origin;
  const body = new URLSearchParams({
    mode: "subscription",
    success_url: `${origin}/?membership=success`,
    cancel_url: `${origin}/?membership=cancelled#membership`,
    customer_email: user.email,
    "line_items[0][price]": membership.price,
    "line_items[0][quantity]": "1",
    "metadata[supabase_user_id]": user.id,
    "metadata[membership_tier]": tier,
    "subscription_data[metadata][supabase_user_id]": user.id,
    "subscription_data[metadata][membership_tier]": tier,
  });

  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${stripeSecretKey}`, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const session = await stripeResponse.json();
  if (!stripeResponse.ok || !session.url) {
    console.error("Stripe membership session error", session?.error?.message || session);
    return json({ error: "Stripe could not start membership checkout." }, 502);
  }
  return json({ url: session.url });
};

export const config = { path: "/api/create-membership-session" };
