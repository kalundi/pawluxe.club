const SUPABASE_URL = "https://cszqmwjkbbrhswdzgoop.supabase.co";
const SUPABASE_KEY = "sb_publishable_waTH6kOiQPcctaK1SAeVlQ_hVHASK8w";
const PLUS_PRICE = "price_1U5VY9P0o9BjdOwS4Y6d5etF";
const VIP_PRICE = "price_1U5VfTP0o9BjdOwSfPqdLtT1";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

export default async (request) => {
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ tier: "free", discount: 0 });
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` } });
  if (!userResponse.ok) return json({ error: "Your sign-in has expired." }, 401);
  const user = await userResponse.json();
  const entitlementResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/member_entitlements?select=tier,is_test,expires_at&email=eq.${encodeURIComponent(user.email.toLowerCase())}&limit=1`,
    { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` } },
  );
  if (!entitlementResponse.ok) return json({ error: "Membership status is temporarily unavailable." }, 502);
  const [entitlement] = await entitlementResponse.json();
  if (entitlement?.tier) {
    const tier = entitlement.tier;
    return json({ tier, discount: tier === "vip" ? 15 : 10, test: Boolean(entitlement.is_test) });
  }
  const stripeKey = Netlify.env.get("STRIPE_SECRET_KEY");
  const stripeGet = async (path) => {
    const response = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { authorization: `Bearer ${stripeKey}` } });
    if (!response.ok) throw new Error("Stripe membership lookup failed");
    return response.json();
  };
  try {
    const customers = await stripeGet(`customers?email=${encodeURIComponent(user.email)}&limit=100`);
    let tier = entitlement?.tier || "free";
    for (const customer of customers.data || []) {
      const subscriptions = await stripeGet(`subscriptions?customer=${encodeURIComponent(customer.id)}&status=all&limit=100`);
      for (const subscription of subscriptions.data || []) {
        if (!["active", "trialing"].includes(subscription.status)) continue;
        const prices = (subscription.items?.data || []).map(item => item.price?.id);
        if (prices.includes(VIP_PRICE)) tier = "vip";
        else if (prices.includes(PLUS_PRICE) && tier !== "vip") tier = "plus";
      }
    }
    return json({ tier, discount: tier === "vip" ? 15 : tier === "plus" ? 10 : 0, test: Boolean(entitlement?.is_test) });
  } catch (error) {
    console.error(error);
    return json({ error: "Membership status is temporarily unavailable." }, 502);
  }
};

export const config = { path: "/api/membership-status" };
