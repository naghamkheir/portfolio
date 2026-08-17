/* ============================================================================
   Nagham Kheir — site backend
   Zero-dependency Node server. Run:  node server.js
   - Serves the site (renders index.template.html with content.json)
   - Admin panel at  /admin  (password-protected)
   - Content API:   GET/PUT /api/content
   - Uploads:       PUT /api/upload/:filename  (raw body -> assets/img or /video)
   - Static export: node server.js --export   (writes index.html for static hosting)
   ============================================================================ */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const PORT = Number(process.env.PORT || 3000);
const CONTENT_FILE = "content.json";
const TEMPLATE_FILE = "index.template.html";
const CONFIG_FILE = "server-config.json";

/* ---------------- config (admin password) ---------------- */

function loadPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    if (cfg.password) return String(cfg.password);
  } catch (_) { /* no config file yet */ }
  return "changeme123";
}

const ADMIN_PASSWORD = loadPassword();
const sessions = new Set(); // admin session tokens (in-memory)

/* ---------------- template engine ---------------- */

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function tokenize(tpl) {
  const re = /{{([^}]+)}}/g;
  const stack = [{ type: "root", children: [] }];
  let last = 0;
  let m;
  while ((m = re.exec(tpl))) {
    if (m.index > last) stack[stack.length - 1].children.push({ type: "text", text: tpl.slice(last, m.index) });
    const tok = m[1].trim();
    if (tok.startsWith("/")) {
      const name = tok.slice(1).trim();
      const top = stack[stack.length - 1];
      const isIfClose = top.type === "block" && top.name.startsWith("if ") && name === "if";
      if (top.type === "block" && (top.name === name || isIfClose)) stack.pop();
      else throw new Error("Mismatched template close: " + name);
    } else if (tok.startsWith("#") || tok.startsWith("^")) {
      const node = { type: "block", kind: tok[0], name: tok.slice(1).trim(), children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else {
      stack[stack.length - 1].children.push({ type: "token", value: tok });
    }
    last = m.index + m[0].length;
  }
  if (last < tpl.length) stack[stack.length - 1].children.push({ type: "text", text: tpl.slice(last) });
  return stack[0].children;
}

function resolve(pathStr, ctxStack) {
  if (pathStr === "." || pathStr === "this") return ctxStack[ctxStack.length - 1];
  const parts = pathStr.split(".").map((p) => p.trim());
  for (let i = ctxStack.length - 1; i >= 0; i--) {
    let cur = ctxStack[i];
    let ok = true;
    for (const p of parts) {
      if (cur == null || !(p in Object(cur))) { ok = false; break; }
      cur = cur[p];
    }
    if (ok) return cur;
  }
  return undefined;
}

function evalNodes(nodes, ctxStack, out) {
  for (const n of nodes) {
    if (n.type === "text") {
      out.push(n.text);
    } else if (n.type === "token") {
      const [pathStr, flag] = n.value.split("|").map((s) => s.trim());
      let v = resolve(pathStr, ctxStack);
      if (v == null) v = "";
      out.push(flag === "raw" ? String(v) : esc(v));
    } else if (n.type === "block") {
      if (n.kind === "#") {
        if (n.name.startsWith("if ")) {
          const cond = resolve(n.name.slice(3).trim(), ctxStack);
          if (cond) evalNodes(n.children, ctxStack, out);
          continue;
        }
        const v = resolve(n.name, ctxStack);
        if (Array.isArray(v)) {
          v.forEach((item, idx) => {
            evalNodes(n.children, ctxStack.concat([{ __index: idx, __first: idx === 0 }, item]), out);
          });
        } else if (v) {
          evalNodes(n.children, ctxStack.concat([v]), out);
        }
      } else if (n.kind === "^") {
        const v = resolve(n.name, ctxStack);
        const empty = v == null || v === "" || (Array.isArray(v) && v.length === 0);
        if (empty) evalNodes(n.children, ctxStack, out);
      }
    }
  }
}

function renderTemplate(tpl, data) {
  const nodes = tokenize(tpl);
  const out = [];
  evalNodes(nodes, [data], out);
  return out.join("");
}

function renderSite() {
  const content = JSON.parse(fs.readFileSync(CONTENT_FILE, "utf8"));
  const tpl = fs.readFileSync(TEMPLATE_FILE, "utf8");
  return renderTemplate(tpl, content);
}

/* ---------------- optional server-side video compression (best-effort) ---------------- */

let ffmpegCheck = null;
function hasFfmpeg() {
  if (ffmpegCheck === null) {
    ffmpegCheck = new Promise((resolve) => {
      const p = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
      p.on("error", () => resolve(false));
      p.on("exit", (c) => resolve(c === 0));
    });
  }
  return ffmpegCheck;
}

function optimizeVideoWithFfmpeg(src, cb) {
  hasFfmpeg().then((ok) => {
    if (!ok) return cb(false);
    try {
      if (fs.statSync(src).size < 8 * 1024 * 1024) return cb(false); // already lean
    } catch (_) { return cb(false); }
    const out = src + ".opt.mp4";
    const args = [
      "-y", "-i", src,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
      "-vf", "scale=min(1920,iw):-2",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      out,
    ];
    const p = spawn("ffmpeg", args, { stdio: "ignore" });
    p.on("error", () => cb(false));
    p.on("exit", (code) => {
      if (code === 0 && fs.existsSync(out) && fs.statSync(out).size > 0) {
        fs.rename(out, src, (err) => { if (err) fs.unlink(out, () => {}); cb(!err); });
      } else {
        fs.unlink(out, () => {});
        cb(false);
      }
    });
  });
}

/* ---------------- helpers ---------------- */

const MIME = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript",
  mjs: "application/javascript",
  json: "application/json; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  pdf: "application/pdf",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  ico: "image/x-icon",
  txt: "text/plain; charset=utf-8",
};

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"]);
const VIDEO_EXT = new Set(["mp4", "webm", "mov"]);
const DOC_EXT = new Set(["pdf"]);

function readBody(req, limitMb, cb) {
  let size = 0;
  const chunks = [];
  req.on("data", (c) => {
    size += c.length;
    if (size > limitMb * 1024 * 1024) {
      cb(new Error("Body too large"));
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on("end", () => cb(null, Buffer.concat(chunks)));
  req.on("error", (e) => cb(e));
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > -1) out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

function isAuthed(req) {
  return sessions.has(parseCookies(req).nk_sid);
}

function setAuthCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `nk_sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
  );
}

function send(res, code, body, type) {
  res.writeHead(code, { "Content-Type": type || "text/plain; charset=utf-8" });
  res.end(body);
}

function sendJson(res, code, obj) {
  send(res, code, JSON.stringify(obj), "application/json; charset=utf-8");
}

/* ---------------- request handler ---------------- */

function serveStatic(urlPath, res) {
  let fp = path.normalize(path.join(process.cwd(), urlPath));
  if (!fp.startsWith(process.cwd())) return send(res, 403, "Forbidden");
  fs.readFile(fp, (err, data) => {
    if (err) return send(res, 404, "Not found");
    const ext = path.extname(fp).slice(1).toLowerCase();
    send(res, 200, data, MIME[ext] || "application/octet-stream");
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;

  /* ---- admin & site pages ---- */
  if (p === "/" || p === "/index.html") {
    try {
      return send(res, 200, renderSite(), "text/html; charset=utf-8");
    } catch (e) {
      return send(res, 500, "Error rendering site: " + e.message);
    }
  }
  if (p === "/admin" || p === "/admin.html") {
    return serveStatic("admin.html", res);
  }

  /* ---- auth ---- */
  if (p === "/api/login" && req.method === "POST") {
    return readBody(req, 1, (err, body) => {
      if (err) return sendJson(res, 413, { error: "Too large" });
      try {
        const { password } = JSON.parse(body.toString("utf8"));
        if (password !== ADMIN_PASSWORD) {
          return sendJson(res, 401, { error: "Wrong password" });
        }
        const token = crypto.randomBytes(24).toString("hex");
        sessions.add(token);
        setAuthCookie(res, token);
        return sendJson(res, 200, { ok: true });
      } catch (_) {
        return sendJson(res, 400, { error: "Bad request" });
      }
    });
  }
  if (p === "/api/logout" && req.method === "POST") {
    sessions.delete(parseCookies(req).nk_sid);
    return sendJson(res, 200, { ok: true });
  }

  /* ---- protected API ---- */
  if (p.startsWith("/api/")) {
    if (!isAuthed(req)) return sendJson(res, 401, { error: "Not logged in" });

    if (p === "/api/content") {
      if (req.method === "GET") {
        try {
          return sendJson(res, 200, JSON.parse(fs.readFileSync(CONTENT_FILE, "utf8")));
        } catch (e) {
          return sendJson(res, 500, { error: e.message });
        }
      }
      if (req.method === "PUT") {
        return readBody(req, 2, (err, body) => {
          if (err) return sendJson(res, 413, { error: "Too large" });
          try {
            const data = JSON.parse(body.toString("utf8"));
            if (typeof data !== "object" || data === null || Array.isArray(data)) {
              return sendJson(res, 400, { error: "Content must be a JSON object" });
            }
            fs.writeFileSync(CONTENT_FILE, JSON.stringify(data, null, 2) + "\n");
            return sendJson(res, 200, { ok: true });
          } catch (e) {
            return sendJson(res, 400, { error: "Invalid JSON: " + e.message });
          }
        });
      }
      return send(res, 405, "Method not allowed");
    }

    if (p === "/api/upload" && req.method === "PUT") {
      return sendJson(res, 400, { error: "Filename missing — use /api/upload/:filename" });
    }
    if (p.startsWith("/api/upload/") && req.method === "PUT") {
      const rawName = decodeURIComponent(p.slice("/api/upload/".length));
      const name = path.basename(rawName);
      if (!/^[A-Za-z0-9._-]+$/.test(name)) {
        return sendJson(res, 400, { error: "Invalid filename" });
      }
      const ext = path.extname(name).slice(1).toLowerCase();
      let folder = null;
      if (IMAGE_EXT.has(ext)) folder = "assets/img";
      else if (VIDEO_EXT.has(ext)) folder = "assets/video";
      else if (DOC_EXT.has(ext)) folder = "assets/docs";
      if (!folder) return sendJson(res, 400, { error: "Unsupported file type: " + ext });
      const dest = path.join(process.cwd(), folder, name);
      if (!dest.startsWith(process.cwd())) return sendJson(res, 403, "Forbidden");
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const tmp = dest + ".uploading";
      const ws = fs.createWriteStream(tmp);
      let tooBig = false;
      req.on("data", (c) => {
        if (ws.bytesWritten + c.length > 250 * 1024 * 1024) tooBig = true;
        if (tooBig) return;
        ws.write(c);
      });
      req.on("end", () => {
        if (tooBig) {
          ws.destroy();
          fs.unlink(tmp, () => {});
          return sendJson(res, 413, { error: "File too large (max 250MB)" });
        }
        ws.end(() => {
          fs.rename(tmp, dest, (err) => {
            if (err) return sendJson(res, 500, { error: err.message });
            const respond = () => sendJson(res, 200, { path: folder + "/" + name });
            // Second safety net: if the client couldn't optimize a video (e.g. Safari,
            // or a direct API call), compress it here when ffmpeg is available.
            const clientOptimized = !!req.headers["x-optimized"];
            if (folder === "assets/video" && !clientOptimized && ext === "mp4") {
              return optimizeVideoWithFfmpeg(dest, () => respond());
            }
            respond();
          });
        });
      });
      req.on("error", () => {
        ws.destroy();
        fs.unlink(tmp, () => {});
      });
      return;
    }

    return send(res, 404, "Unknown API route");
  }

  /* ---- static files ---- */
  serveStatic(p, res);
});

/* ---------------- export mode ---------------- */

if (process.argv.includes("--export")) {
  try {
    fs.writeFileSync("index.html", renderSite());
    console.log("index.html written (static export).");
  } catch (e) {
    console.error("Export failed:", e.message);
    process.exit(1);
  }
  process.exit(0);
}

/* ---------------- start ---------------- */

server.listen(PORT, () => {
  console.log(`▶  Site:        http://localhost:${PORT}`);
  console.log(`▶  Admin panel: http://localhost:${PORT}/admin`);
  console.log(`   Password:    ${ADMIN_PASSWORD === "changeme123" ? "changeme123 (CHANGE IT — edit server-config.json or set ADMIN_PASSWORD)" : "from server-config.json / ADMIN_PASSWORD env"}`);
});
