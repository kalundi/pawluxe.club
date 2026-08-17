const SUPABASE_URL = "https://cszqmwjkbbrhswdzgoop.supabase.co";
const SUPABASE_KEY = "sb_publishable_waTH6kOiQPcctaK1SAeVlQ_hVHASK8w";
const SERVICES = Object.freeze({
  "Dog Walking": 1500,
  "Pet Sitting": 2500,
  "Drop-In Visit": 1200,
  "Overnight Care": 5500,
});

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8" },
});
const clean = (value, max = 500) => String(value || "").trim().slice(0, max);

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const stripeSecret = Netlify.env.get("STRIPE_SECRET_KEY");
  const supabaseSecret = Netlify.env.get("SUPABASE_SECRET_KEY") || Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!stripeSecret || !supabaseSecret) return json({ error: "Booking payments are not configured yet." }, 503);

  const input = await request.json().catch(() => ({}));
  const booking = {
    customer_name: clean(input.name, 120),
    customer_email: clean(input.email, 254).toLowerCase(),
    customer_phone: clean(input.phone, 30),
    service: clean(input.service, 80),
    pet_name: clean(input.petName, 120) || null,
    pet_breed: clean(input.petBreed, 120),
    requested_date: clean(input.date, 10),
    requested_time: clean(input.time, 30),
    instructions: clean(input.details, 2000) || null,
    sms_consent: input.smsConsent === true,
  };
  if (!booking.customer_name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(booking.customer_email)
    || !/^\+?[\d\s().-]{7,30}$/.test(booking.customer_phone) || !(booking.service in SERVICES)
    || !booking.pet_breed || !/^\d{4}-\d{2}-\d{2}$/.test(booking.requested_date) || !booking.requested_time) {
    return json({ error: "Please complete every required booking field." }, 400);
  }

  let discountPercent = 0;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (token) {
    const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` },
    });
    if (userResponse.ok) {
      const user = await userResponse.json();
      if (user.email?.toLowerCase() === booking.customer_email) {
        const entitlementResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/member_entitlements?select=tier&email=eq.${encodeURIComponent(booking.customer_email)}&limit=1`,
          { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` } },
        );
        if (entitlementResponse.ok) {
          const [entitlement] = await entitlementResponse.json();
          discountPercent = entitlement?.tier === "vip" ? 15 : entitlement?.tier === "plus" ? 10 : 0;
        }
      }
    }
  }
  const servicePrice = Math.round(SERVICES[booking.service] * (1 - discountPercent / 100));
  const reservationFee = Math.max(50, Math.round(servicePrice * 0.10));
  Object.assign(booking, {
    service_price_cents: servicePrice,
    member_discount_percent: discountPercent,
    reservation_fee_cents: reservationFee,
  });

  const insertResponse = await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
    method: "POST",
    headers: {
      apikey: supabaseSecret,
      authorization: `Bearer ${supabaseSecret}`,
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: JSON.stringify(booking),
  });
  const [saved] = await insertResponse.json().catch(() => []);
  if (!insertResponse.ok || !saved?.id) return json({ error: "The booking request could not be saved." }, 502);

  const origin = new URL(request.url).origin;
  const stripeBody = new URLSearchParams({
    mode: "payment",
    success_url: `${origin}/?booking=success&session_id={CHECKOUT_SESSION_ID}#book`,
    cancel_url: `${origin}/?booking=cancelled#book`,
    customer_email: booking.customer_email,
    "phone_number_collection[enabled]": "true",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(reservationFee),
    "line_items[0][price_data][product_data][name]": `10% reservation fee — ${booking.service}`,
    "line_items[0][price_data][product_data][description]": `Requested for ${booking.requested_date} at ${booking.requested_time}. Applied toward the service total.`,
    "line_items[0][quantity]": "1",
    "metadata[purpose]": "care_booking_reservation",
    "metadata[booking_id]": saved.id,
  });
  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${stripeSecret}`, "content-type": "application/x-www-form-urlencoded" },
    body: stripeBody,
  });
  const session = await stripeResponse.json();
  if (!stripeResponse.ok || !session.url) return json({ error: "Stripe could not start the reservation payment." }, 502);
  await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${saved.id}`, {
    method: "PATCH",
    headers: { apikey: supabaseSecret, authorization: `Bearer ${supabaseSecret}`, "content-type": "application/json" },
    body: JSON.stringify({ stripe_session_id: session.id }),
  });
  return json({ url: session.url, reservationFee });
};

export const config = { path: "/api/create-booking-session" };
