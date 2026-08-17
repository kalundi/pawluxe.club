const PRODUCTS = Object.freeze({
  "Luxury Treat Box": 1499,
  "Playtime Toy Pack": 1899,
  "Pawluxe Monthly Box": 2299,
});

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

  const stripeBody = new URLSearchParams({
    mode: "payment",
    success_url: `${new URL(request.url).origin}/?checkout=success`,
    cancel_url: `${new URL(request.url).origin}/?checkout=cancelled`,
    "billing_address_collection": "auto",
    "phone_number_collection[enabled]": "true",
  });

  [...quantities.entries()].forEach(([name, quantity], index) => {
    stripeBody.set(`line_items[${index}][price_data][currency]`, "usd");
    stripeBody.set(`line_items[${index}][price_data][unit_amount]`, String(PRODUCTS[name]));
    stripeBody.set(`line_items[${index}][price_data][product_data][name]`, name);
    stripeBody.set(`line_items[${index}][quantity]`, String(quantity));
  });

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
