import { useEffect, useState } from "react";
import styles from "../styles/Home.module.css";

function buildTemplate(data) {
  const nameVersion = data.version ? `${data.name} v${data.version}` : data.name;
  return `[b]${nameVersion}[/b]
[u]Requirements:[/u] ${data.requirements}
[u]Overview:[/u] ${data.overview}

https://images.mobilism.org/index.php (upload your imgs here.)
[break]
${data.description}

[u]What's New:[/u]
${data.whatsNew || "(no recent changes listed — add manually)"}

[b]This app has credit advertisements[/b]

[u]More Info:[/u]
[code]${data.playStoreUrl}[/code]
[u]Download Instructions:[/u]


Mirrors:


Trouble downloading? Read [url=https://forum.mobilism.org/viewtopic.php?f=19&t=649944][b]This[/b][/url].`;
}

export default function Home() {
  const [playUrl, setPlayUrl] = useState("");
  const [output, setOutput] = useState("");
  const [image, setImage] = useState("");
  const [appName, setAppName] = useState("");
  const [status, setStatus] = useState(null);
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const saved = window.localStorage.getItem("templatefill-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("templatefill-theme", theme);
  }, [theme]);

  async function handleFetch() {
    if (!playUrl.trim()) return;
    setStatus({ kind: "loading", text: "Fetching from the Play Store…" });
    try {
      const res = await fetch(`/api/fetch-app?url=${encodeURIComponent(playUrl.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: "error", text: data.error || "Fetch failed." });
        return;
      }
      setOutput(buildTemplate(data));
      setImage((data.screenshots && data.screenshots[0]) || data.icon || "");
      setAppName(data.name);
      setStatus({ kind: "ok", text: `Pulled "${data.name}" — edit freely below.` });
    } catch (err) {
      setStatus({ kind: "error", text: "Network error. Try again." });
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (e) {}
  }

  return (
    <div className={styles.shell}>
      <div className={styles.topbar}>
        <p className={styles.brand}>
          template<span>fill</span>
        </p>
        <button
          className={styles.themeBtn}
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          aria-label="Toggle theme"
        >
          <span className={styles.themeDot} />
          {theme === "dark" ? "Light" : "Dark"}
        </button>
      </div>

      <div className={styles.fetchBar}>
        <input
          type="url"
          className={styles.fetchInput}
          placeholder="paste a Play Store link…"
          value={playUrl}
          onChange={(e) => setPlayUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleFetch()}
        />
        <button className={styles.btn} onClick={handleFetch} disabled={status?.kind === "loading"}>
          {status?.kind === "loading" ? "Fetching…" : "Fetch"}
        </button>
      </div>

      {status && (
        <div className={`${styles.status} ${styles[status.kind]}`}>{status.text}</div>
      )}

      <div className={styles.grid}>
        <div className={styles.imageCard}>
          <span className={styles.imageLabel}>PREVIEW</span>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={appName} className={styles.imagePic} />
          ) : (
            <div className={styles.imageEmpty}>
              <span className={styles.imageEmptyGlyph}>▢</span>
              <span>fetch an app to load its image</span>
            </div>
          )}
          {appName && <span className={styles.imageCaption}>{appName}</span>}
        </div>

        <div className={styles.outputCard}>
          <div className={styles.outputBar}>
            <span>listing.bbcode</span>
            <div className={styles.outputBarRight}>
              <span>{output.length} chars</span>
              <button className={styles.copyBtn} onClick={handleCopy} disabled={!output}>
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
          </div>
          <textarea
            className={styles.outputBody}
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            placeholder="your BBCode listing will appear here — fetch a Play Store link, then edit anything you like"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
