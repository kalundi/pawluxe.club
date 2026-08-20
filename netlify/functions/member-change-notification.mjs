const SUPABASE_URL = "https://cszqmwjkbbrhswdzgoop.supabase.co";
const SUPABASE_KEY = "sb_publishable_waTH6kOiQPcctaK1SAeVlQ_hVHASK8w";
const OWNER_EMAIL = "contact@pawluxe.club";
const OWNER_PHONE = "+13015007946";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8" },
});
const clean = (value, max = 160) => String(value || "").trim().slice(0, max);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[character]));

async function sendEmail(apiKey, to, subject, html, replyTo = OWNER_EMAIL) {
  if (!apiKey) return false;
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: OWNER_EMAIL, name: "Pawluxe Club" },
      reply_to: { email: replyTo },
      subject,
      content: [{ type: "text/html", value: html }],
    }),
  });
  if (!response.ok) console.error("SendGrid member-change delivery failed", response.status, await response.text());
  return response.ok;
}

async function sendOwnerSms(body) {
  const accountSid = Netlify.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Netlify.env.get("TWILIO_AUTH_TOKEN");
  const from = Netlify.env.get("TWILIO_PHONE_NUMBER");
  const to = Netlify.env.get("PAWLUXE_ALERT_PHONE") || OWNER_PHONE;
  if (!accountSid || !authToken || !from) return false;
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!response.ok) console.error("Twilio member-change SMS failed", response.status, await response.text());
  return response.ok;
}

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in is required." }, 401);
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` },
  });
  if (!userResponse.ok) return json({ error: "Your session could not be verified." }, 401);
  const user = await userResponse.json();
  const input = await request.json().catch(() => ({}));
  const type = clean(input.type, 40);
  const petName = clean(input.petName, 120) || "your pet";
  const allowed = {
    pet_profile_saved: {
      ownerSubject: `Pet profile updated — ${petName}`,
      customerSubject: `${petName}'s Pawluxe profile was updated`,
      ownerAction: "Review the member profile before the next service if care instructions changed.",
      customerAction: "Your latest profile information is now available to Pawluxe for future care.",
      sms: `Pawluxe member update: ${petName}'s pet profile was saved by ${user.email}. Review before the next service.`,
    },
    safety_record_saved: {
      ownerSubject: `Vaccination and safety record submitted — ${petName}`,
      customerSubject: `${petName}'s safety record was received`,
      ownerAction: "Please review and confirm the record before providing service. Private medical details remain in the secure member record.",
      customerAction: "Pawluxe received the record for review. A booking is not approved for service until the record is confirmed.",
      sms: `Pawluxe safety update: ${petName}'s record was submitted by ${user.email}. Review and confirm before service.`,
    },
  };
  const notice = allowed[type];
  if (!notice) return json({ error: "Unsupported notification type." }, 400);
  const safePet = escapeHtml(petName);
  const safeEmail = escapeHtml(user.email);
  const sendgridKey = Netlify.env.get("SENDGRID_API_KEY");
  const results = await Promise.all([
    sendEmail(sendgridKey, OWNER_EMAIL, notice.ownerSubject,
      `<h2>${escapeHtml(notice.ownerSubject)}</h2><p><strong>Member:</strong> ${safeEmail}<br><strong>Pet:</strong> ${safePet}</p><p>${escapeHtml(notice.ownerAction)}</p>`, user.email),
    sendEmail(sendgridKey, user.email, notice.customerSubject,
      `<h2>Update received</h2><p>Thank you. ${escapeHtml(notice.customerAction)}</p><p><strong>Pet:</strong> ${safePet}</p><p>Need help or need to make a correction? Reply to this email or call <a href="tel:+13015007946">301-500-7946</a>.</p>`),
    sendOwnerSms(notice.sms),
  ]);
  return json({
    notified: results.some(Boolean),
    channels: { ownerEmail: results[0], customerEmail: results[1], ownerSms: results[2] },
  });
};

export const config = { path: "/api/member-change-notification" };
