const SUPABASE_URL = "https://cszqmwjkbbrhswdzgoop.supabase.co";
const SUPABASE_KEY = "sb_publishable_waTH6kOiQPcctaK1SAeVlQ_hVHASK8w";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8" },
});

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const origin = request.headers.get("origin");
  if (origin && !["https://pawluxe.club", "https://www.pawluxe.club"].includes(origin)) {
    return json({ error: "This signup request is not allowed." }, 403);
  }

  const body = await request.json().catch(() => ({}));
  if (body.company) return json({ success: true });
  const email = String(body.email || "").trim().toLowerCase();
  const firstName = String(body.firstName || "").trim().slice(0, 80) || null;
  const newsletter = body.newsletter !== false;
  const blogUpdates = body.blogUpdates !== false;
  const source = body.source === "blog" ? "blog" : "website";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json({ error: "Please enter a valid email address." }, 400);
  }
  if (!newsletter && !blogUpdates) return json({ error: "Choose at least one update type." }, 400);

  const response = await fetch(`${SUPABASE_URL}/rest/v1/newsletter_subscribers`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      authorization: `Bearer ${SUPABASE_KEY}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({
      email,
      first_name: firstName,
      newsletter,
      blog_updates: blogUpdates,
      consented_at: new Date().toISOString(),
      source,
      active: true,
    }),
  });
  if (response.status === 409) return json({ success: true, alreadySubscribed: true });
  if (!response.ok) {
    console.error("Newsletter signup failed", response.status, await response.text());
    return json({ error: "We could not save your signup. Please try again." }, 502);
  }
  return json({ success: true });
};

export const config = { path: "/api/newsletter-signup" };
