// Free Supabase projects pause after a week without activity. This Netlify
// scheduled function calls the app's /api/keep-alive route once a day so the
// database stays awake. Netlify sets URL to the site's main address.
export default async function keepAlive() {
  const site = process.env.URL;
  if (!site) {
    console.log("keep-alive: URL is not set, skipping");
    return;
  }
  const res = await fetch(`${site}/api/keep-alive`);
  console.log(`keep-alive: ${res.status} ${await res.text()}`);
}

export const config = {
  schedule: "@daily",
};
