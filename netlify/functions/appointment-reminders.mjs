const SUPABASE_URL = "https://cszqmwjkbbrhswdzgoop.supabase.co";
const OWNER_EMAIL = "contact@pawluxe.club";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[character]));
const dateKey = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};
const monthKey = (date) => date.toISOString().slice(0, 7);
const groupByEmail = (rows) => rows.reduce((groups, row) => {
  const email = row.customer_email.toLowerCase();
  if (!groups.has(email)) groups.set(email, []);
  groups.get(email).push(row);
  return groups;
}, new Map());

function serviceList(bookings) {
  return `<ul>${bookings.map((booking) => `<li><strong>${escapeHtml(booking.service)}</strong> for ${escapeHtml(booking.pet_name || "your pet")} — ${escapeHtml(booking.requested_date)} at ${escapeHtml(booking.requested_time)}</li>`).join("")}</ul>`;
}

function helpBlock() {
  return `<p><strong>Need help or need to reschedule?</strong> Please contact Pawluxe as soon as possible so we can help avoid a missed appointment.</p><p>Email <a href="mailto:${OWNER_EMAIL}?subject=Pawluxe%20appointment%20help">${OWNER_EMAIL}</a> or call <a href="tel:+13015007946">301-500-7946</a>.</p>`;
}

async function sendEmail(apiKey, to, subject, html) {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: OWNER_EMAIL, name: "Pawluxe Club" },
      reply_to: { email: OWNER_EMAIL },
      subject,
      content: [{ type: "text/html", value: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#2f1f18"><h1 style="font-family:Georgia,serif">Pawluxe Club</h1>${html}<p style="color:#735f52">Thank you for trusting Pawluxe with your pets.</p></div>` }],
    }),
  });
  if (!response.ok) throw new Error(`SendGrid ${response.status}: ${await response.text()}`);
}

function database(secret) {
  const headers = { apikey: secret, authorization: `Bearer ${secret}`, "content-type": "application/json" };
  return {
    async get(path) {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
      if (!response.ok) throw new Error(`Supabase GET ${response.status}: ${await response.text()}`);
      return response.json();
    },
    async insert(row) {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/reminder_deliveries`, {
        method: "POST", headers: { ...headers, prefer: "return=minimal" }, body: JSON.stringify(row),
      });
      if (!response.ok) throw new Error(`Supabase log ${response.status}: ${await response.text()}`);
    },
    async delivered(deliveryKey) {
      const rows = await this.get(`reminder_deliveries?select=id&delivery_key=eq.${encodeURIComponent(deliveryKey)}&limit=1`);
      return rows.length > 0;
    },
  };
}

async function deliverOnce(db, sendgridKey, delivery, email) {
  if (await db.delivered(delivery.delivery_key)) return false;
  await sendEmail(sendgridKey, delivery.customer_email, email.subject, email.html);
  await db.insert(delivery);
  return true;
}

async function sendUpcomingReminders(db, sendgridKey, today, bookings) {
  let sent = 0;
  const monthlyPeriod = monthKey(today);
  for (const [email, customerBookings] of groupByEmail(bookings).entries()) {
    const key = `monthly:${email}:${monthlyPeriod}`;
    sent += Number(await deliverOnce(db, sendgridKey, {
      delivery_key: key, customer_email: email, reminder_type: "monthly_summary", period_key: monthlyPeriod,
      metadata: { booking_ids: customerBookings.map((booking) => booking.id) },
    }, {
      subject: `Your ${today.toLocaleString("en-US", { month: "long", timeZone: "UTC" })} Pawluxe care schedule`,
      html: `<h2>Your upcoming Pawluxe services</h2><p>Here is your monthly reminder of scheduled care:</p>${serviceList(customerBookings)}${helpBlock()}`,
    }));
  }

  for (const [days, type, label] of [[7, "seven_day", "one week"], [1, "one_day", "tomorrow"]]) {
    const dueDate = dateKey(addDays(today, days));
    for (const booking of bookings.filter((item) => item.requested_date === dueDate)) {
      const key = `${type}:${booking.id}:${dueDate}`;
      sent += Number(await deliverOnce(db, sendgridKey, {
        delivery_key: key, customer_email: booking.customer_email.toLowerCase(), reminder_type: type,
        booking_id: booking.id, period_key: dueDate, metadata: { service: booking.service, pet_name: booking.pet_name },
      }, {
        subject: `Pawluxe reminder: ${booking.service} ${label}`,
        html: `<h2>Your Pawluxe appointment is ${label}</h2>${serviceList([booking])}<p>We look forward to caring for ${escapeHtml(booking.pet_name || "your pet")}.</p>${helpBlock()}`,
      }));
    }
  }
  return sent;
}

async function sendYearlyReports(db, sendgridKey, today) {
  if (today.getUTCMonth() !== 0 || today.getUTCDate() > 7) return 0;
  const reportYear = today.getUTCFullYear() - 1;
  const rows = await db.get(`bookings?select=id,customer_name,customer_email,service,pet_name,requested_date,requested_time,booking_status&booking_status=eq.confirmed&payment_status=eq.paid&requested_date=gte.${reportYear}-01-01&requested_date=lte.${reportYear}-12-31&order=requested_date.asc`);
  let sent = 0;
  for (const [email, bookings] of groupByEmail(rows).entries()) {
    const petTotals = bookings.reduce((totals, booking) => {
      const pet = booking.pet_name || "Your pet";
      totals[pet] = (totals[pet] || 0) + 1;
      return totals;
    }, {});
    const petSummary = Object.entries(petTotals).map(([pet, count]) => `<li><strong>${escapeHtml(pet)}</strong>: ${count} Pawluxe ${count === 1 ? "activity" : "activities"}</li>`).join("");
    const key = `yearly:${email}:${reportYear}`;
    sent += Number(await deliverOnce(db, sendgridKey, {
      delivery_key: key, customer_email: email, reminder_type: "yearly_report", period_key: String(reportYear),
      metadata: { booking_ids: bookings.map((booking) => booking.id) },
    }, {
      subject: `${reportYear} Pawluxe pet activity report`,
      html: `<h2>${reportYear} year in review</h2><p>Your pets completed <strong>${bookings.length}</strong> Pawluxe ${bookings.length === 1 ? "activity" : "activities"}.</p><ul>${petSummary}</ul><h3>Activity history</h3>${serviceList(bookings)}${helpBlock()}`,
    }));
  }
  return sent;
}

export default async () => {
  const supabaseSecret = Netlify.env.get("SUPABASE_SECRET_KEY") || Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const sendgridKey = Netlify.env.get("SENDGRID_API_KEY");
  if (!supabaseSecret || !sendgridKey) throw new Error("Reminder delivery environment variables are not configured.");
  const db = database(supabaseSecret);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const through = dateKey(addDays(today, 31));
  const upcoming = await db.get(`bookings?select=id,customer_name,customer_email,service,pet_name,requested_date,requested_time,booking_status,payment_status&booking_status=eq.confirmed&payment_status=eq.paid&requested_date=gte.${dateKey(today)}&requested_date=lte.${through}&order=requested_date.asc`);
  const reminders = await sendUpcomingReminders(db, sendgridKey, today, upcoming);
  const reports = await sendYearlyReports(db, sendgridKey, today);
  console.log(`Pawluxe reminders complete: ${reminders} reminders, ${reports} yearly reports sent.`);
};

export const config = { schedule: "0 14 * * *" };
