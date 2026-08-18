const SUPABASE_URL = "https://cszqmwjkbbrhswdzgoop.supabase.co";
const OWNER_EMAIL = "contact@pawluxe.club";
const ISSUE = {
  key: "2026-08",
  subject: "From AZÉA: Move with purpose — August’s canine science letter",
  url: "https://pawluxe.club/newsletter.html",
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[character]));

async function databaseGet(secret, path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: secret, authorization: `Bearer ${secret}` },
  });
  if (!response.ok) throw new Error(`Supabase GET ${response.status}: ${await response.text()}`);
  return response.json();
}

async function logDelivery(secret, row) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/newsletter_deliveries`, {
    method: "POST",
    headers: { apikey: secret, authorization: `Bearer ${secret}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify(row),
  });
  if (!response.ok && response.status !== 409) throw new Error(`Delivery log ${response.status}: ${await response.text()}`);
}

function emailHtml(subscriber) {
  const greeting = subscriber.first_name ? `Dear ${escapeHtml(subscriber.first_name)},` : "Dear Pawluxe patron,";
  return `<div style="background:#fbf7f2;padding:28px 14px;font-family:Arial,sans-serif;color:#2f1f18"><div style="max-width:640px;margin:auto;background:#fff;border:1px solid #e7d4c1;border-radius:24px;overflow:hidden"><div style="background:#2f1f18;color:#fff;padding:34px"><div style="color:#e3b377;font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">Pawluxe Canine Science Letter · August 2026</div><h1 style="font:700 42px/1 Georgia,serif;margin:12px 0">Move with purpose.</h1><p style="color:#eadfd6;line-height:1.6">A better daily rhythm for every dog.</p></div><div style="padding:34px"><p>${greeting}</p><p style="line-height:1.7;color:#735f52">This month’s one-page brief turns trusted canine-health guidance into a practical plan: match activity to the dog, observe their response, and adjust with care.</p><h2 style="font-family:Georgia,serif">Three actions for this month</h2><ol style="line-height:1.8;color:#735f52"><li><strong>Match</strong> activity to life stage, health, breed tendencies, temperament, and weather.</li><li><strong>Observe</strong> pace, posture, breathing, enthusiasm, and recovery.</li><li><strong>Adjust</strong> duration, intensity, environment, or enrichment when your dog communicates a need.</li></ol><p style="line-height:1.7;color:#735f52">The full letter includes a seven-day community challenge, practical questions to discuss with your veterinarian, and ways Pawluxe can support a more individualized routine.</p><p><a href="${ISSUE.url}" style="display:inline-block;background:#bd7f3b;color:#fff;text-decoration:none;padding:13px 18px;border-radius:999px;font-weight:800">Read the August letter</a></p><p style="font:italic 24px Georgia,serif;color:#bd7f3b">With care,<br>AZÉA</p><hr style="border:0;border-top:1px solid #e7d4c1;margin:28px 0"><p style="font-size:12px;line-height:1.6;color:#806e63">This educational newsletter is informed by AAHA canine life-stage guidance and AKC Canine Health Foundation resources. It is not veterinary advice. You received it as an active Pawluxe member or newsletter subscriber. To unsubscribe from newsletters, email <a href="mailto:${OWNER_EMAIL}?subject=Unsubscribe%20from%20Pawluxe%20newsletter">${OWNER_EMAIL}</a>.</p></div></div></div>`;
}

async function sendEmail(apiKey, subscriber) {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: subscriber.email }] }],
      from: { email: OWNER_EMAIL, name: "AZÉA at Pawluxe Club" },
      reply_to: { email: OWNER_EMAIL },
      subject: ISSUE.subject,
      content: [{ type: "text/html", value: emailHtml(subscriber) }],
    }),
  });
  if (!response.ok) throw new Error(`SendGrid ${response.status}: ${await response.text()}`);
  return String(response.status);
}

export default async () => {
  const today = new Date();
  const currentKey = today.toISOString().slice(0, 7);
  if (currentKey !== ISSUE.key) {
    console.log(`No published Pawluxe newsletter configured for ${currentKey}.`);
    return;
  }
  const supabaseSecret = Netlify.env.get("SUPABASE_SECRET_KEY") || Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const sendgridKey = Netlify.env.get("SENDGRID_API_KEY");
  if (!supabaseSecret || !sendgridKey) throw new Error("Newsletter delivery environment variables are not configured.");
  const [subscribers,members] = await Promise.all([
    databaseGet(supabaseSecret, "newsletter_subscribers?select=id,email,first_name&active=eq.true&newsletter=eq.true&order=created_at.asc"),
    databaseGet(supabaseSecret, "member_directory?select=email,display_name&order=created_at.asc"),
  ]);
  const recipients = new Map();
  subscribers.forEach((item) => recipients.set(item.email.toLowerCase(), { email: item.email.toLowerCase(), first_name: item.first_name, subscriber_id: item.id }));
  members.forEach((item) => { const email=item.email.toLowerCase(),existing=recipients.get(email);recipients.set(email,{ email, first_name:existing?.first_name||item.display_name?.split(/\s+/)[0]||null, subscriber_id:existing?.subscriber_id||null }); });
  let sent = 0;
  for (const subscriber of recipients.values()) {
    const recipientKey = subscriber.email.toLowerCase();
    const delivered = await databaseGet(supabaseSecret, `newsletter_deliveries?select=id&issue_key=eq.${ISSUE.key}&recipient_key=eq.${encodeURIComponent(recipientKey)}&limit=1`);
    if (delivered.length) continue;
    const providerStatus = await sendEmail(sendgridKey, subscriber);
    await logDelivery(supabaseSecret, { issue_key: ISSUE.key, recipient_key: recipientKey, subscriber_id: subscriber.subscriber_id, email: subscriber.email, provider: "sendgrid", provider_status: providerStatus });
    sent += 1;
  }
  console.log(`Pawluxe ${ISSUE.key} newsletter complete: ${sent} sent, ${recipients.size - sent} previously delivered.`);
};

export const config = { schedule: "0 14 1 * *" };
