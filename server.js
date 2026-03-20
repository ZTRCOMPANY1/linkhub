const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

/**
 * Em produção no Render, você pode montar um disco em /var/data
 * e setar DATA_DIR=/var/data/linkhub
 * Se não existir, usa a pasta local do projeto.
 */
const DATA_DIR = process.env.DATA_DIR
  ? process.env.DATA_DIR
  : path.join(__dirname, "data");

const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const DB_PATH = path.join(DATA_DIR, "db.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function ensureDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(
      DB_PATH,
      JSON.stringify(
        {
          users: [],
          admin: {
            username: "admin",
            password: "admin123"
          }
        },
        null,
        2
      )
    );
  }
}

function readDB() {
  ensureDB();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function sendJSON(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(data));
}

function sendText(res, status, text) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end(text);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".gif": "image/gif"
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      return sendText(res, 404, "Arquivo não encontrado");
    }

    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000"
    });
    res.end(data);
  });
}

function parseJSONBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });

    req.on("error", reject);
  });
}

function parseRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function createSlug(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^-+|-+$/g, "");
}

function defaultLinks() {
  const now = Date.now().toString();
  return [
    { id: `${now}1`, title: "YouTube", url: "https://youtube.com/", icon: "▶", clicks: 0 },
    { id: `${now}2`, title: "Instagram", url: "https://instagram.com/", icon: "📸", clicks: 0 },
    { id: `${now}3`, title: "Twitch", url: "https://twitch.tv/", icon: "🎮", clicks: 0 },
    { id: `${now}4`, title: "Site pessoal", url: "https://example.com/", icon: "🌐", clicks: 0 }
  ];
}

const THEMES = {
  purple: {
    id: "purple",
    name: "Purple Neon",
    color: "#7c3aed"
  },
  blue: {
    id: "blue",
    name: "Blue Ocean",
    color: "#2563eb"
  },
  green: {
    id: "green",
    name: "Cyber Green",
    color: "#10b981"
  },
  red: {
    id: "red",
    name: "Inferno Red",
    color: "#ef4444"
  }
};

function getPublicUser(user) {
  return {
    username: user.username,
    slug: user.slug,
    avatar: user.avatar,
    bio: user.bio,
    themeId: user.themeId,
    themeColor: user.themeColor,
    customDomain: user.customDomain || "",
    links: user.links || [],
    analytics: {
      visits: user.analytics?.visits || 0,
      uniqueVisitors: user.analytics?.uniqueVisitors || 0,
      lastVisitAt: user.analytics?.lastVisitAt || null
    }
  };
}

function getAllowedOrigin(origin) {
  const allowed = [
    "https://juliontb.site",
    "https://www.juliontb.site",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ];

  if (!origin) return "";
  return allowed.includes(origin) ? origin : "";
}

function setCors(req, res) {
  const origin = getAllowedOrigin(req.headers.origin || "");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function getClientIP(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return String(forwarded).split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

function extFromMime(mime, originalName) {
  const byMime = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/gif": ".gif"
  };

  if (byMime[mime]) return byMime[mime];
  return path.extname(originalName || "").toLowerCase() || ".png";
}

function extractMultipart(req, rawBuffer) {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(.+)$/);

  if (!boundaryMatch) return null;

  const boundary = "--" + boundaryMatch[1];
  const parts = rawBuffer.toString("binary").split(boundary);

  for (const part of parts) {
    if (part.includes('name="avatar"') && part.includes("filename=")) {
      const filenameMatch = part.match(/filename="([^"]+)"/);
      const contentTypeMatch = part.match(/Content-Type:\s([^\r\n]+)/i);

      if (!filenameMatch) continue;

      const filename = filenameMatch[1];
      const mime = contentTypeMatch ? contentTypeMatch[1].trim() : "application/octet-stream";

      const start = part.indexOf("\r\n\r\n");
      if (start === -1) continue;

      let fileBinary = part.substring(start + 4);
      fileBinary = fileBinary.replace(/\r\n--$/, "");
      fileBinary = fileBinary.replace(/\r\n$/, "");

      return {
        filename,
        mime,
        buffer: Buffer.from(fileBinary, "binary")
      };
    }
  }

  return null;
}

const server = http.createServer(async (req, res) => {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Healthcheck
  if (pathname === "/" && req.method === "GET") {
    return sendJSON(res, 200, {
      ok: true,
      service: "LinkHub API",
      time: new Date().toISOString()
    });
  }

  // Uploads
  if (pathname.startsWith("/uploads/") && req.method === "GET") {
    const filename = pathname.replace("/uploads/", "");
    const safePath = path.join(UPLOADS_DIR, filename);

    if (!safePath.startsWith(UPLOADS_DIR)) {
      return sendText(res, 403, "Acesso negado");
    }

    if (!fs.existsSync(safePath)) {
      return sendText(res, 404, "Arquivo não encontrado");
    }

    return sendFile(res, safePath);
  }

  // Registrar
  if (pathname === "/api/register" && req.method === "POST") {
    try {
      const body = await parseJSONBody(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "").trim();

      if (!username || !password) {
        return sendJSON(res, 400, { error: "Usuário e senha são obrigatórios." });
      }

      const db = readDB();
      const slug = createSlug(username);

      const exists = db.users.find(
        u =>
          u.username.toLowerCase() === username.toLowerCase() ||
          u.slug === slug
      );

      if (exists) {
        return sendJSON(res, 409, { error: "Usuário já existe." });
      }

      const user = {
        id: Date.now().toString(),
        username,
        password,
        slug,
        avatar: "https://i.imgur.com/axQ9wQb.png",
        bio: "Meu cantinho na internet 🚀",
        themeId: "purple",
        themeColor: THEMES.purple.color,
        customDomain: "",
        links: defaultLinks(),
        analytics: {
          visits: 0,
          uniqueVisitors: 0,
          visitorIPs: [],
          lastVisitAt: null
        }
      };

      db.users.push(user);
      writeDB(db);

      return sendJSON(res, 201, {
        message: "Conta criada com sucesso.",
        user: getPublicUser(user)
      });
    } catch (error) {
      return sendJSON(res, 500, { error: "Erro ao criar conta." });
    }
  }

  // Login usuário
  if (pathname === "/api/login" && req.method === "POST") {
    try {
      const body = await parseJSONBody(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "").trim();

      const db = readDB();
      const user = db.users.find(
        u =>
          u.username.toLowerCase() === username.toLowerCase() &&
          u.password === password
      );

      if (!user) {
        return sendJSON(res, 401, { error: "Login inválido." });
      }

      return sendJSON(res, 200, {
        message: "Login realizado com sucesso.",
        user: getPublicUser(user)
      });
    } catch (error) {
      return sendJSON(res, 500, { error: "Erro no login." });
    }
  }

  // Login admin
  if (pathname === "/api/admin-login" && req.method === "POST") {
    try {
      const body = await parseJSONBody(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "").trim();

      const db = readDB();

      if (
        username === db.admin.username &&
        password === db.admin.password
      ) {
        return sendJSON(res, 200, {
          message: "Admin logado com sucesso.",
          admin: true
        });
      }

      return sendJSON(res, 401, { error: "Login admin inválido." });
    } catch (error) {
      return sendJSON(res, 500, { error: "Erro no login admin." });
    }
  }

  // Upload avatar
  if (pathname === "/api/upload-avatar" && req.method === "POST") {
    try {
      const slug = String(parsedUrl.query.slug || "").trim();

      if (!slug) {
        return sendJSON(res, 400, { error: "Slug não informado." });
      }

      const raw = await parseRawBody(req);
      const file = extractMultipart(req, raw);

      if (!file) {
        return sendJSON(res, 400, { error: "Arquivo de avatar não encontrado." });
      }

      const ext = extFromMime(file.mime, file.filename);
      const fileName = `${slug}-${Date.now()}${ext}`;
      const filePath = path.join(UPLOADS_DIR, fileName);

      fs.writeFileSync(filePath, file.buffer);

      const db = readDB();
      const user = db.users.find(u => u.slug === slug);

      if (!user) {
        return sendJSON(res, 404, { error: "Usuário não encontrado." });
      }

      user.avatar = `https://api.juliontb.site/uploads/${fileName}`;
      writeDB(db);

      return sendJSON(res, 200, {
        message: "Avatar enviado com sucesso.",
        avatar: user.avatar
      });
    } catch (error) {
      return sendJSON(res, 500, { error: "Erro ao enviar avatar." });
    }
  }

  // Atualizar perfil
  if (pathname === "/api/update-profile" && req.method === "POST") {
    try {
      const body = await parseJSONBody(req);

      const slug = String(body.slug || "").trim();
      const avatar = String(body.avatar || "").trim();
      const bio = String(body.bio || "");
      const themeId = String(body.themeId || "purple").trim();
      const themeColor = String(body.themeColor || THEMES.purple.color).trim();
      const customDomain = String(body.customDomain || "").trim().toLowerCase();
      const links = Array.isArray(body.links) ? body.links : [];

      const db = readDB();
      const user = db.users.find(u => u.slug === slug);

      if (!user) {
        return sendJSON(res, 404, { error: "Usuário não encontrado." });
      }

      user.avatar = avatar || user.avatar;
      user.bio = bio;
      user.themeId = themeId;
      user.themeColor = themeColor;
      user.customDomain = customDomain;

      user.links = links
        .filter(link => link && link.title && link.url)
        .map(link => ({
          id: String(link.id || `${Date.now()}${Math.random().toString(36).slice(2)}`),
          title: String(link.title).trim(),
          url: String(link.url).trim(),
          icon: String(link.icon || "🔗").trim(),
          clicks: Number(link.clicks || 0)
        }));

      writeDB(db);

      return sendJSON(res, 200, {
        message: "Perfil atualizado com sucesso.",
        user: getPublicUser(user)
      });
    } catch (error) {
      return sendJSON(res, 500, { error: "Erro ao atualizar perfil." });
    }
  }

  // Perfil público por slug
  if (pathname.startsWith("/api/user/") && req.method === "GET") {
    const slug = pathname.split("/").pop();
    const db = readDB();
    const user = db.users.find(u => u.slug === slug);

    if (!user) {
      return sendJSON(res, 404, { error: "Usuário não encontrado." });
    }

    return sendJSON(res, 200, getPublicUser(user));
  }

  // Resolver domínio customizado
  // O frontend envia ?host=dominio-atual
  if (pathname === "/api/resolve-domain" && req.method === "GET") {
    const host = String(parsedUrl.query.host || "").toLowerCase().trim();

    if (!host) {
      return sendJSON(res, 400, { error: "Host não informado." });
    }

    const db = readDB();
    const user = db.users.find(
      u => u.customDomain && u.customDomain.toLowerCase() === host
    );

    if (!user) {
      return sendJSON(res, 404, { error: "Domínio não encontrado." });
    }

    return sendJSON(res, 200, {
      slug: user.slug,
      username: user.username
    });
  }

  // Registrar visita
  if (pathname.startsWith("/api/visit/") && req.method === "POST") {
    const slug = pathname.split("/").pop();
    const db = readDB();
    const user = db.users.find(u => u.slug === slug);

    if (!user) {
      return sendJSON(res, 404, { error: "Usuário não encontrado." });
    }

    if (!user.analytics) {
      user.analytics = {
        visits: 0,
        uniqueVisitors: 0,
        visitorIPs: [],
        lastVisitAt: null
      };
    }

    user.analytics.visits += 1;
    const ip = getClientIP(req);

    if (!user.analytics.visitorIPs.includes(ip)) {
      user.analytics.visitorIPs.push(ip);
      user.analytics.uniqueVisitors += 1;
    }

    user.analytics.lastVisitAt = new Date().toISOString();

    writeDB(db);

    return sendJSON(res, 200, {
      visits: user.analytics.visits,
      uniqueVisitors: user.analytics.uniqueVisitors,
      lastVisitAt: user.analytics.lastVisitAt
    });
  }

  // Registrar clique
  if (pathname.startsWith("/api/click/") && req.method === "POST") {
    const parts = pathname.split("/");
    const slug = parts[3];
    const linkId = parts[4];

    const db = readDB();
    const user = db.users.find(u => u.slug === slug);

    if (!user) {
      return sendJSON(res, 404, { error: "Usuário não encontrado." });
    }

    const link = (user.links || []).find(l => l.id === linkId);

    if (!link) {
      return sendJSON(res, 404, { error: "Link não encontrado." });
    }

    link.clicks = Number(link.clicks || 0) + 1;
    writeDB(db);

    return sendJSON(res, 200, {
      message: "Clique registrado.",
      url: link.url,
      clicks: link.clicks
    });
  }

  // Admin - listar usuários
  if (pathname === "/api/admin/users" && req.method === "GET") {
    const db = readDB();

    const users = db.users.map(user => ({
      id: user.id,
      username: user.username,
      slug: user.slug,
      customDomain: user.customDomain || "",
      visits: user.analytics?.visits || 0,
      uniqueVisitors: user.analytics?.uniqueVisitors || 0,
      totalClicks: (user.links || []).reduce(
        (sum, link) => sum + Number(link.clicks || 0),
        0
      )
    }));

    return sendJSON(res, 200, { users });
  }

  // Admin - remover usuário
  if (pathname.startsWith("/api/admin/delete-user/") && req.method === "DELETE") {
    const slug = pathname.split("/").pop();
    const db = readDB();

    const index = db.users.findIndex(u => u.slug === slug);

    if (index === -1) {
      return sendJSON(res, 404, { error: "Usuário não encontrado." });
    }

    db.users.splice(index, 1);
    writeDB(db);

    return sendJSON(res, 200, { message: "Usuário removido com sucesso." });
  }

  return sendText(res, 404, "Rota não encontrada");
});

server.listen(PORT, HOST, () => {
  console.log(`API rodando em http://${HOST}:${PORT}`);
});