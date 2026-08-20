const SUPABASE_URL = "https://cszqmwjkbbrhswdzgoop.supabase.co";
const SUPABASE_KEY = "sb_publishable_waTH6kOiQPcctaK1SAeVlQ_hVHASK8w";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const clean = (value, max = 240) => String(value || "").trim().slice(0, max);

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in is required." }, 401);
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` } });
  if (!userResponse.ok) return json({ error: "Your session could not be verified." }, 401);
  const user = await userResponse.json();
  const input = await request.json().catch(() => ({}));
  const petId = clean(input.petId, 80), petName = clean(input.petName, 120) || "your pet", clinic = input.clinic || {};
  if (!/^[0-9a-f-]{36}$/i.test(petId) || !clean(clinic.name)) return json({ error: "Choose a pet and veterinary clinic." }, 400);
  const headers = { apikey: SUPABASE_KEY, authorization: `Bearer ${token}`, "content-type": "application/json" };
  const petResponse = await fetch(`${SUPABASE_URL}/rest/v1/pets?select=id&id=eq.${encodeURIComponent(petId)}&deleted_at=is.null&limit=1`, { headers });
  const pets = await petResponse.json().catch(() => []);
  if (!petResponse.ok || !pets.length) return json({ error: "The selected pet could not be verified." }, 403);
  const record = {
    pet_id: petId,
    owner_user_id: user.id,
    clinic_name: clean(clinic.name),
    clinic_phone: clean(clinic.phone, 40) || null,
    clinic_website: clean(clinic.website) || null,
    clinic_source_id: clean(clinic.id, 160) || null,
    status: "pending_clinic_contact",
  };
  const insertResponse = await fetch(`${SUPABASE_URL}/rest/v1/vet_record_requests`, { method: "POST", headers: { ...headers, prefer: "return=representation" }, body: JSON.stringify(record) });
  const saved = await insertResponse.json().catch(() => []);
  if (!insertResponse.ok) return json({ error: "The veterinary-record request could not be saved." }, 502);
  let notification = null;
  try {
    const noticeResponse = await fetch(new URL("/api/member-change-notification", request.url), { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ type: "vet_records_requested", petName }) });
    notification = await noticeResponse.json();
  } catch (error) {
    console.error("Veterinary record notification failed", error);
  }
  return json({ request: saved[0], notification });
};

export const config = { path: "/api/vet-record-request" };
