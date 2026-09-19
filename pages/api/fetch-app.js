import gplayPkg from "google-play-scraper";

// google-play-scraper ships as CJS; normalize the export either way.
const gplay = gplayPkg.default ? gplayPkg.default : gplayPkg;

function formatRequirements(app) {
  let text = (app.androidVersionText || app.androidVersion || "").trim();
  if (!text) return "";
  const lower = text.toLowerCase();
  if (lower.includes("and up") || lower.includes("varies")) return text;
  if (/^[\d.]+$/.test(text)) return `${text} and up`;
  return text;
}

function stripEmojis(str) {
  if (!str) return str;
  const noEmoji = str
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\p{Emoji_Presentation}/gu, "")
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "") // regional indicators (flag emoji)
    .replace(/[\u200D\uFE0F\u2060]/gu, ""); // ZWJ / variation selector / word joiner

  // collapse double-spaces left behind by removal, but keep each line's
  // original leading indentation (Play Store descriptions use it for bullets)
  return noEmoji
    .split("\n")
    .map((line) => {
      const leading = line.match(/^[ \t]*/)[0];
      const rest = line.slice(leading.length).replace(/[ \t]{2,}/g, " ").replace(/[ \t]+$/, "");
      return leading + rest;
    })
    .join("\n");
}

function extractAppId(rawUrl) {
  try {
    const u = new URL(rawUrl.trim());
    const idFromQuery = u.searchParams.get("id");
    if (idFromQuery) return idFromQuery;
  } catch (e) {
    // not a full URL — maybe the user pasted the bare package id
  }
  // fallback: something like "com.whatsapp" typed directly
  if (/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(rawUrl.trim())) {
    return rawUrl.trim();
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: "Missing 'url' query param" });
  }

  const appId = extractAppId(url);
  if (!appId) {
    return res.status(400).json({
      error:
        "Couldn't find a package id in that link. Paste the full Play Store URL (…/store/apps/details?id=com.example.app) or just the package id.",
    });
  }

  try {
    const app = await gplay.app({ appId, lang: "en", country: "us" });

    return res.status(200).json({
      appId,
      name: stripEmojis(app.title || ""),
      version: app.version || "",
      requirements: formatRequirements(app),
      overview: stripEmojis(app.summary || ""),
      description: stripEmojis(app.description || app.summary || ""),
      whatsNew: stripEmojis(app.recentChanges || ""),
      icon: app.icon || "",
      screenshots: Array.isArray(app.screenshots) ? app.screenshots.slice(0, 6) : [],
      developer: app.developer || "",
      playStoreUrl: app.url || `https://play.google.com/store/apps/details?id=${appId}`,
    });
  } catch (err) {
    return res.status(502).json({
      error:
        "Couldn't fetch that app from the Play Store. Check the link, or fill the fields in manually below.",
      detail: String(err && err.message ? err.message : err),
    });
  }
}
