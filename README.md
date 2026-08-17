# Nagham Kheir — Content Creator Portfolio

A responsive portfolio site (rebuilt from her [Canva site](https://minialhaddad.my.canva.site/nagham-kheir-portfolio))
with a small built-in backend so the whole website can be edited from a browser — no coding needed.

## Quick start

```bash
node server.js
```

Then open:

- **Site:** <http://localhost:3000>
- **Admin panel:** <http://localhost:3000/admin>

The admin panel is protected by a password (default: `changeme123`).
**Change it now** — edit `server-config.json` or set the `ADMIN_PASSWORD` environment variable.

## What you can edit from the admin panel

Every part of the site, from one screen:

- **Site** — page title, meta description, brand text
- **Navigation** — menu links + CTA
- **Hero** — headline, subtitle, buttons, portrait photo
- **CV / Resume** — upload a PDF CV; a "Download CV" button then appears in the hero and the
  contact section (the button stays hidden until a file is uploaded)
- **Ticker** — scrolling words
- **About** — paragraphs, badges, photo
- **Content Style** — niche heading, description, photos + captions
- **Services** — add/remove service cards
- **Work Videos** — the 4 categories and their videos (add/remove, upload new videos + posters)
- **Photography** — the photo grid (upload new photos)
- **Testimonials** — featured client (name, photo, video, quote, stars, badge) and the other client names
- **Contact** — email, WhatsApp link, Instagram link, thank-you text
- **Footer**

Changes are saved to `content.json` and the live site updates instantly.
Text fields that say *HTML allowed* accept basic tags like `<strong>`.

### Uploading photos & videos

Every photo/video field has an **Upload** button — pick a file and it's copied into
`assets/img/`, `assets/video/`, or `assets/docs/` automatically. Supported: JPG, PNG, GIF,
WebP, SVG, MP4/WebM/MOV videos, and PDF files (up to 250MB each).

## How it works

```
server.js            – the backend (no dependencies): serves the site, admin API, uploads
index.template.html  – the site template ({{placeholders}} filled from content.json)
content.json         – all editable content (what the admin panel edits)
admin.html           – the admin editor UI (served at /admin)
assets/              – photos, videos, fonts
index.html           – static export (see below)
server-config.json   – admin password (gitignored)
```

## Deployment

Two options:

**1. GitHub Pages (free, no server — recommended for the public site):**

1. Create a repo, push this folder to it (include `index.html`, `.nojekyll`, `favicon.svg`, `assets/`).
2. In the repo: **Settings → Pages → Build and deployment → Source: "Deploy from a branch" → main / (root)** → Save.
3. Your site is live at `https://<user>.github.io/<repo>/` within a minute.

The repo already contains everything Pages needs:

- `index.html` — the exported, fully static site (no server required)
- `.nojekyll` — disables Jekyll so assets are served as-is
- `favicon.svg`, `assets/` — all relative paths, no build step
- `.github/workflows/export.yml` — on every push, GitHub re-runs `node server.js --export`
  and commits the regenerated `index.html`, so the Pages site always matches `content.json`
  even if you forget to export manually

> The admin panel (`/admin`) needs a Node server and **won't work on GitHub Pages**. To edit the
> live site: run the backend locally (or on a free Node host), edit, then `git push` — the workflow
> exports for you. If you want to edit entirely without a server, edit `content.json` directly and
> push — the workflow rebuilds the site.

**2. Node host (if you want the admin panel live):**
Deploy to any Node host — Render, Railway, Fly.io, or a VPS. Run `node server.js`.
Make sure the admin password is set via the `ADMIN_PASSWORD` environment variable there,
and that the host keeps the folder writable (content.json + assets must be persistent storage).

**3. Any static host (Netlify / Vercel / Cloudflare Pages):** just drag the folder in — no build
step. If you edit `content.json` afterwards, re-run `node server.js --export` before redeploying.

## Performance

The site is optimized to load fast on GitHub Pages / any static host:

- **~640 KB initial load** (measured in a real browser; was 2.2 MB before optimization)
- **LCP ≈ 1.2 s on simulated slow 3G** — well under the 2.5 s "good" threshold
- **Videos never load until scrolled into view** (`preload="none"` + play-on-view), and they stream
  progressively (the `moov` atom is at the start of every file)
- **Video posters lazy-load** via CSS backgrounds — hidden work-grid cards don't fetch anything
- **Optimized images** — the testimonial avatar is a 184px WebP (~8 KB) and the About cutout is a
  WebP (~41 KB); the hero photo uses `fetchpriority="high"`
- **Self-hosted fonts** with `font-display: swap` and preload hints — no third-party requests
- A `.nojekyll` file disables GitHub Pages' Jekyll build so files are served as-is

**Keeping it fast — uploads are optimized automatically:**

- **Photos** are re-encoded in your browser before upload: resized to max 2000px and converted to
  WebP (~82% quality). A 7 MB phone photo uploads as ~120 KB (98% smaller). Transparent PNGs keep
  their transparency; GIFs and SVGs pass through untouched.
- **Videos** are re-encoded in your browser to WebP's video sibling — WebM (VP9) at ~2.5 Mbps —
  with the audio track preserved. The encode plays in real time, so a 30-second clip takes about
  30 seconds (the button shows progress). Clips that are already efficiently compressed (≤ ~2.8 Mbps)
  or under 5 MB are uploaded as-is — no pointless re-encode. A 4K phone video drops from tens of
  megabytes to a few.
- **Server fallback:** if the browser can't re-encode (e.g. Safari) and the host has `ffmpeg`
  installed, `server.js` compresses the video server-side after upload (H.264, ~1080p, faststart).
  Without ffmpeg it stores the file as-is — uploads always succeed.
- The old advice still holds for direct API uploads: avoid 90 MB piles of un-compressed video.

## Running locally

```bash
node server.js            # site + admin on http://localhost:3000
node server.js --export   # writes a static index.html
```

Node 18+ is required. There are no npm dependencies — nothing to install.
