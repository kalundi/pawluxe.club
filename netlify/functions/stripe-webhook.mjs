import { createHmac, timingSafeEqual } from "node:crypto";

const SUPABASE_URL = "https://cszqmwjkbbrhswdzgoop.supabase.co";
const OWNER_EMAIL = "contact@pawluxe.club";
const OWNER_PHONE = "+13015007946";
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[character]));

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

async function sendEmail(apiKey, to, subject, html, replyTo) {
  if (!apiKey) return false;
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: OWNER_EMAIL, name: "Pawluxe Club" },
      reply_to: { email: replyTo || OWNER_EMAIL },
      subject,
      content: [{ type: "text/html", value: html }],
    }),
  });
  if (!response.ok) console.error("SendGrid delivery failed", response.status, await response.text());
  return response.ok;
}

async function sendSms(to, body) {
  const accountSid = Netlify.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Netlify.env.get("TWILIO_AUTH_TOKEN");
  const from = Netlify.env.get("TWILIO_PHONE_NUMBER");
  if (!accountSid || !authToken || !from || !to) return false;
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  if (!response.ok) console.error("Twilio SMS failed", response.status, await response.text());
  return response.ok;
}

async function handlePaidBooking(bookingId, session, supabaseSecret) {
  const headers = { apikey: supabaseSecret, authorization: `Bearer ${supabaseSecret}`, "content-type": "application/json" };
  const getResponse = await fetch(`${SUPABASE_URL}/rest/v1/bookings?select=*&id=eq.${encodeURIComponent(bookingId)}&limit=1`, { headers });
  const [booking] = await getResponse.json();
  if (!getResponse.ok || !booking) throw new Error("Booking was not found");
  await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${booking.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ payment_status: "paid", booking_status: "requested", stripe_session_id: session.id, updated_at: new Date().toISOString() }),
  });
  if (booking.notifications_sent_at) return;
  const fee = (booking.reservation_fee_cents / 100).toFixed(2);
  const details = `${booking.service} for ${booking.pet_name || "your pet"} on ${booking.requested_date} at ${booking.requested_time}`;
  const safe = Object.fromEntries(Object.entries(booking).map(([key, value]) => [key, escapeHtml(value)]));
  const safeDetails = escapeHtml(details);
  const sendgridKey = Netlify.env.get("SENDGRID_API_KEY");
  await Promise.all([
    sendEmail(sendgridKey, booking.customer_email, "Thank you — your Pawluxe care request is reserved",
      `<h2>Thank you, ${safe.customer_name}!</h2><p>We received your request for <strong>${safeDetails}</strong>.</p><p>Your <strong>$${fee} reservation fee</strong> was paid successfully and will be applied toward your service total.</p><p>This reserves your request; the Pawluxe team will contact you to confirm final availability and care details.</p><p>Questions? Reply to this email or call 301-500-7946.</p>`),
    sendEmail(sendgridKey, OWNER_EMAIL, `Paid Pawluxe booking request — ${booking.service}`,
      `<h2>New paid booking request</h2><p><strong>Customer:</strong> ${safe.customer_name}<br><strong>Email:</strong> ${safe.customer_email}<br><strong>Phone:</strong> ${safe.customer_phone}</p><p><strong>Request:</strong> ${safeDetails}<br><strong>Pet type/breed:</strong> ${safe.pet_breed}<br><strong>Reservation paid:</strong> $${fee}</p><p><strong>Instructions:</strong> ${safe.instructions || "None provided"}</p>`, booking.customer_email),
    booking.sms_consent
      ? sendSms(booking.customer_phone, `Pawluxe: Thank you, ${booking.customer_name}! We received your ${booking.service} request for ${booking.requested_date} at ${booking.requested_time}. Your $${fee} reservation fee was paid. We’ll contact you to confirm. Reply STOP to opt out.`)
      : Promise.resolve(false),
    sendSms(Netlify.env.get("PAWLUXE_ALERT_PHONE") || OWNER_PHONE, `New paid Pawluxe request: ${details}. Customer: ${booking.customer_name}, ${booking.customer_phone}.`),
  ]);
  await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${booking.id}`, {
    method: "PATCH", headers, body: JSON.stringify({ notifications_sent_at: new Date().toISOString() }),
  });
}

async function handleCommerceNotification(session) {
  const sendgridKey = Netlify.env.get("SENDGRID_API_KEY");
  const email = session.customer_details?.email || session.customer_email;
  if (!email) throw new Error("Checkout customer email was not provided");
  const phone = session.customer_details?.phone;
  const amount = Number(session.amount_total || 0) / 100;
  const isMembership = session.mode === "subscription" && session.metadata?.membership_tier;
  const label = isMembership
    ? `Pawluxe ${session.metadata.membership_tier === "vip" ? "VIP" : "Plus"} membership`
    : session.metadata?.order_summary || "Pawluxe shop order";
  const action = isMembership ? (session.metadata.membership_change === "upgrade" ? "membership upgrade" : "new membership") : "shop order";
  const safeLabel = escapeHtml(label);
  await Promise.all([
    sendEmail(sendgridKey, email, `Pawluxe confirmation — ${label}`,
      `<h2>Thank you for your ${escapeHtml(action)}</h2><p>We received your payment for <strong>${safeLabel}</strong>.</p><p><strong>Total paid:</strong> $${amount.toFixed(2)}</p><p>If anything requires confirmation, the Pawluxe team will contact you. Questions? Reply to this email or call 301-500-7946.</p>`),
    sendEmail(sendgridKey, OWNER_EMAIL, `New Pawluxe ${action} — ${label}`,
      `<h2>New ${escapeHtml(action)}</h2><p><strong>Customer:</strong> ${escapeHtml(email)}${phone ? `<br><strong>Phone:</strong> ${escapeHtml(phone)}` : ""}</p><p><strong>Details:</strong> ${safeLabel}<br><strong>Total paid:</strong> $${amount.toFixed(2)}</p>`, email),
    sendSms(Netlify.env.get("PAWLUXE_ALERT_PHONE") || OWNER_PHONE,
      `New Pawluxe ${action}: ${label}. Customer: ${email}${phone ? `, ${phone}` : ""}. Paid $${amount.toFixed(2)}.`),
  ]);
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
  if (event.type === "checkout.session.completed" && session?.metadata?.purpose === "care_booking_reservation") {
    try {
      await handlePaidBooking(session.metadata.booking_id, session, supabaseSecret);
    } catch (error) {
      console.error("Paid booking processing failed", error);
      return json({ error: "Booking processing failed." }, 500);
    }
    return json({ received: true });
  }
  if (event.type === "checkout.session.completed"
    && (session?.metadata?.purpose === "product_order" || (session?.mode === "subscription" && session?.metadata?.membership_tier))) {
    try {
      await handleCommerceNotification(session);
    } catch (error) {
      console.error("Commerce notification failed", error);
      return json({ error: "Commerce notification failed." }, 500);
    }
  }
  if (event.type === "checkout.session.expired" && session?.metadata?.purpose === "care_booking_reservation") {
    await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(session.metadata.booking_id)}`, {
      method: "PATCH",
      headers: { apikey: supabaseSecret, authorization: `Bearer ${supabaseSecret}`, "content-type": "application/json" },
      body: JSON.stringify({ payment_status: "expired", updated_at: new Date().toISOString() }),
    });
    return json({ received: true });
  }
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
