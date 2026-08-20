const SUPABASE_URL = "https://cszqmwjkbbrhswdzgoop.supabase.co";
const SUPABASE_KEY = "sb_publishable_waTH6kOiQPcctaK1SAeVlQ_hVHASK8w";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, max-age=900" } });
const clean = (value, max = 240) => String(value || "").trim().slice(0, max);

const national = [
  { name: "Petfinder", scope: "National shelter and rescue directory", website: "https://www.petfinder.com/animal-shelters-and-rescues/search/" },
  { name: "Adopt a Pet", scope: "National adoption and rehoming resources", website: "https://www.adoptapet.com/" },
  { name: "ASPCA Shelter Finder", scope: "National animal-welfare resources", website: "https://www.aspca.org/adopt-pet/find-shelter" },
  { name: "Home To Home", scope: "Community-supported direct rehoming", website: "https://home-home.org/" },
];

export default async (request) => {
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in is required." }, 401);
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` } });
  if (!userResponse.ok) return json({ error: "Your session could not be verified." }, 401);
  const zip = new URL(request.url).searchParams.get("zip")?.trim();
  if (!/^\d{5}(?:-\d{4})?$/.test(zip || "")) return json({ error: "Enter a valid U.S. ZIP code." }, 400);
  const apiKey = Netlify.env.get("GOOGLE_PLACES_API_KEY");
  if (!apiKey) return json({ local: [], national, warning: "Local directory is not configured yet." });
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey, "x-goog-fieldmask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.businessStatus" },
    body: JSON.stringify({ textQuery: `animal shelters dog rescues adoption centers near ${zip}`, pageSize: 20, languageCode: "en", regionCode: "US" }),
  });
  if (!response.ok) return json({ local: [], national, warning: "Local directory is temporarily unavailable." });
  const payload = await response.json();
  const local = (payload.places || []).filter(place => place.businessStatus !== "CLOSED_PERMANENTLY").map(place => ({
    sourceId: clean(place.id, 160), name: clean(place.displayName?.text), address: clean(place.formattedAddress), phone: clean(place.nationalPhoneNumber, 40), website: clean(place.websiteUri || place.googleMapsUri), qualificationStatus: "pending_pawluxe_review",
  })).filter(center => center.name);
  return json({ local, national });
};

export const config = { path: "/api/adoption-directory" };
