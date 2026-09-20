import gplayPkg from "google-play-scraper";

// google-play-scraper ships as CJS; normalize the export either way.
const gplay = gplayPkg.default ? gplayPkg.default : gplayPkg;

export const config = {
  maxDuration: 20,
};

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

  return noEmoji
    .split("\n")
    .map((line) => {
      const leading = line.match(/^[ \t]*/)[0];
      const rest = line.slice(leading.length).replace(/[ \t]{2,}/g, " ").replace(/[ \t]+$/, "");
      return leading + rest;
    })
    .join("\n");
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractBetween(html, startMarkers, endMarkers) {
  let startIdx = -1;
  for (const marker of startMarkers) {
    const idx = html.indexOf(marker);
    if (idx !== -1) {
      startIdx = idx + marker.length;
      break;
    }
  }
  if (startIdx === -1) return "";
  let endIdx = html.length;
  for (const marker of endMarkers) {
    const idx = html.indexOf(marker, startIdx);
    if (idx !== -1 && idx < endIdx) endIdx = idx;
  }
  return html.slice(startIdx, endIdx);
}

const ICON_LIGATURES = [
  "arrow_forward",
  "info_outline",
  "expand_more",
  "more_vert",
  "flag",
  "phone_android",
  "public",
  "email",
  "shield",
  "chevron_right",
  "check_circle",
  "star_rate",
];

function htmlFragmentToText(fragment) {
  let text = fragment
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  text = decodeHtmlEntities(text);
  const iconPattern = new RegExp(`\\b(${ICON_LIGATURES.join("|")})\\b`, "g");
  text = text.replace(iconPattern, "");
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l, i, arr) => l.length > 0 || (arr[i - 1] && arr[i - 1].length > 0))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fallbackScrape(appId) {
  const pageUrl = `https://play.google.com/store/apps/details?id=${appId}&hl=en&gl=us`;
  const res = await fetch(pageUrl, {
    headers: { "Accept-Language": "en-US,en;q=0.9" },
  });
  if (!res.ok) throw new Error(`Play Store page returned ${res.status}`);
  const html = await res.text();

  const grab = (re) => {
    const m = html.match(re);
    return m ? decodeHtmlEntities(m[1]) : "";
  };

  let title = grab(/<meta property="og:title" content="([^"]+)"/);
  title = title.replace(/\s*-\s*Apps on Google Play\s*$/i, "");
  const shortDescription = grab(/<meta property="og:description" content="([^"]+)"/);
  const icon = grab(/<meta property="og:image" content="([^"]+)"/);

  let fullDescription = "";
  let category = "";
  const ldMatches = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  for (const m of ldMatches) {
    try {
      const parsed = JSON.parse(m[1]);
      const obj = Array.isArray(parsed) ? parsed.find((p) => p && p.description) : parsed;
      if (obj && obj.description && obj.description.length > fullDescription.length) {
        fullDescription = obj.description;
      }
      if (obj && obj.applicationCategory) category = obj.applicationCategory;
    } catch (e) {
      // not valid JSON — skip this block
    }
  }

  const aboutSectionHtml = extractBetween(
    html,
    ["About this app"],
    ["Data safety", "Ratings and reviews", "App support", "More by", "Updated on"]
  );
  const scrapedDescription = htmlFragmentToText(aboutSectionHtml);

  const candidates = [fullDescription, scrapedDescription, shortDescription].filter(Boolean);
  const bestDescription = candidates.reduce((a, b) => (b.length > a.length ? b : a), "");

  const screenshotSet = new Set(
    Array.from(html.matchAll(/https:\/\/play-lh\.googleusercontent\.com\/[A-Za-z0-9_-]+=w526-h296/g)).map(
      (m) => m[0]
    )
  );

  return {
    title,
    description: bestDescription,
    overview: shortDescription,
    icon,
    category,
    screenshots: Array.from(screenshotSet).slice(0, 6),
  };
}

function extractAppId(rawUrl) {
  try {
    const u = new URL(rawUrl.trim());
    const idFromQuery = u.searchParams.get("id");
    if (idFromQuery) return idFromQuery;
  } catch (e) {
    // not a full URL — maybe the user pasted the bare package id
  }
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

  const countries = ["us", "gb", "in", "ca"];
  let lastErr = null;

  for (const country of countries) {
    try {
      const app = await gplay.app({ appId, lang: "en", country });

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
        fetchedRegion: country,
      });
    } catch (err) {
      lastErr = err;
    }
  }

  try {
    const fb = await fallbackScrape(appId);
    if (fb.title) {
      return res.status(200).json({
        appId,
        name: stripEmojis(fb.title),
        version: "",
        requirements: "",
        overview: stripEmojis(fb.overview || fb.description),
        description: stripEmojis(fb.description),
        whatsNew: "",
        icon: fb.icon,
        screenshots: fb.screenshots,
        developer: "",
        category: fb.category,
        playStoreUrl: `https://play.google.com/store/apps/details?id=${appId}`,
        partial: true,
      });
    }
  } catch (fbErr) {
    lastErr = fbErr;
  }

  return res.status(502).json({
    error: "Couldn't fetch that app from the Play Store. Check the link, or edit the output manually.",
    detail: String(lastErr && lastErr.message ? lastErr.message : lastErr),
  });
}
