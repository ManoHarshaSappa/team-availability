// api/availability.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const {
    GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO,
    GITHUB_FILE_PATH = "availability.json",
    GITHUB_BRANCH = "main",
  } = process.env;

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO)
    return res.status(500).send("Missing GitHub env vars");

  const headers = { Authorization:`Bearer ${GITHUB_TOKEN}`, Accept:"application/vnd.github+json" };
  const base = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(GITHUB_FILE_PATH)}`;

  if (req.method === "GET") {
    const r = await fetch(`${base}?ref=${GITHUB_BRANCH}`, { headers });
    if (r.status === 404) return res.json({ users:{}, log:[] });
    if (!r.ok) return res.status(r.status).send(await r.text());
    const j = await r.json();
    const text = Buffer.from(j.content, "base64").toString("utf8");
    try { return res.json(JSON.parse(text)); } catch { return res.json({ users:{}, log:[] }); }
  }

  if (req.method === "POST") {
    const body = req.body || {};
    const pretty = JSON.stringify(body, null, 2);
    let sha;
    const head = await fetch(`${base}?ref=${GITHUB_BRANCH}`, { headers });
    if (head.ok) { const j = await head.json(); sha = j.sha; }

    const put = await fetch(base, {
      method:"PUT",
      headers:{ ...headers, "Content-Type":"application/json" },
      body: JSON.stringify({
        message:`availability: update by ${body?.log?.[0]?.user || "unknown"}`,
        content: Buffer.from(pretty).toString("base64"),
        sha, branch: GITHUB_BRANCH
      })
    });

    if (!put.ok) return res.status(put.status).send(await put.text());
    const out = await put.json();
    return res.json({ ok:true, commit: out.commit?.sha?.slice(0,7) });
  }

  res.setHeader("Allow","GET,POST,OPTIONS");
  return res.status(405).end("Method Not Allowed");
}
