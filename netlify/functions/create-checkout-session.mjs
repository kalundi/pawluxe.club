const PRODUCTS = Object.freeze({
  "Luxury Treat Box": 1499,
  "Playtime Toy Pack": 1899,
  "Pawluxe Monthly Box": 2299,
});
const SUPABASE_URL = "https://cszqmwjkbbrhswdzgoop.supabase.co";
const SUPABASE_KEY = "sb_publishable_waTH6kOiQPcctaK1SAeVlQ_hVHASK8w";
const PLUS_PRICE = "price_1U5VfTP0o9BjdOwSfPqdLtT1";
const VIP_PRICE = "price_1U5VY9P0o9BjdOwS4Y6d5etF";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

export default async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const stripeSecretKey = Netlify.env.get("STRIPE_SECRET_KEY");
  if (!stripeSecretKey) {
    console.error("STRIPE_SECRET_KEY is not configured.");
    return json({ error: "Checkout is not configured yet." }, 503);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid checkout request." }, 400);
  }

  if (!Array.isArray(payload.cart) || payload.cart.length === 0) {
    return json({ error: "Your cart is empty." }, 400);
  }

  const quantities = new Map();
  for (const item of payload.cart) {
    if (!item || typeof item.name !== "string" || !(item.name in PRODUCTS)) {
      return json({ error: "The cart contains an unavailable product." }, 400);
    }
    quantities.set(item.name, (quantities.get(item.name) || 0) + 1);
  }

  let membershipTier = "free";
  let authenticatedUser = null;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (token) {
    const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` } });
    if (!userResponse.ok) return json({ error: "Your sign-in has expired. Please sign in again." }, 401);
    const user = await userResponse.json();
    authenticatedUser = user;
    const stripeGet = async (path) => {
      const response = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { authorization: `Bearer ${stripeSecretKey}` } });
      if (!response.ok) throw new Error("Stripe membership lookup failed");
      return response.json();
    };
    try {
      const customers = await stripeGet(`customers?email=${encodeURIComponent(user.email)}&limit=100`);
      for (const customer of customers.data || []) {
        const subscriptions = await stripeGet(`subscriptions?customer=${encodeURIComponent(customer.id)}&status=all&limit=100`);
        for (const subscription of subscriptions.data || []) {
          if (!["active", "trialing"].includes(subscription.status)) continue;
          const prices = (subscription.items?.data || []).map(item => item.price?.id);
          if (prices.includes(VIP_PRICE)) membershipTier = "vip";
          else if (prices.includes(PLUS_PRICE) && membershipTier !== "vip") membershipTier = "plus";
        }
      }
    } catch (error) {
      console.error(error);
      return json({ error: "Membership could not be verified. Please try again." }, 502);
    }
  }
  const discountPercent = membershipTier === "vip" ? 15 : membershipTier === "plus" ? 10 : 0;

  const stripeBody = new URLSearchParams({
    mode: "payment",
    success_url: `${new URL(request.url).origin}/?checkout=success`,
    cancel_url: `${new URL(request.url).origin}/?checkout=cancelled`,
    "billing_address_collection": "auto",
    "phone_number_collection[enabled]": "true",
  });

  [...quantities.entries()].forEach(([name, quantity], index) => {
    stripeBody.set(`line_items[${index}][price_data][currency]`, "usd");
    stripeBody.set(`line_items[${index}][price_data][unit_amount]`, String(Math.round(PRODUCTS[name] * (1 - discountPercent / 100))));
    stripeBody.set(`line_items[${index}][price_data][product_data][name]`, name);
    if (discountPercent) stripeBody.set(`line_items[${index}][price_data][product_data][description]`, `${discountPercent}% ${membershipTier === "vip" ? "VIP" : "Plus"} member discount applied`);
    stripeBody.set(`line_items[${index}][quantity]`, String(quantity));
  });
  stripeBody.set("metadata[membership_tier]", membershipTier);
  stripeBody.set("metadata[discount_percent]", String(discountPercent));
  if (authenticatedUser?.email) stripeBody.set("customer_email", authenticatedUser.email);
  if (authenticatedUser?.id) stripeBody.set("metadata[supabase_user_id]", authenticatedUser.id);

  try {
    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${stripeSecretKey}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: stripeBody,
    });
    const session = await stripeResponse.json();

    if (!stripeResponse.ok || !session.url) {
      console.error("Stripe Checkout Session error", session?.error?.message || session);
      return json({ error: "Stripe could not start checkout. Please try again." }, 502);
    }

    return json({ url: session.url });
  } catch (error) {
    console.error("Stripe request failed", error);
    return json({ error: "Checkout is temporarily unavailable." }, 502);
  }
};

export const config = { path: "/api/create-checkout-session" };
