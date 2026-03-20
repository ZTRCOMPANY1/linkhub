const API_BASE =
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://api.juliontb.site";

const THEMES = {
  purple: { color: "#7c3aed" },
  blue: { color: "#2563eb" },
  green: { color: "#10b981" },
  red: { color: "#ef4444" }
};

function getStoredUser() {
  return JSON.parse(localStorage.getItem("linkHubUser") || "null");
}

function setStoredUser(user) {
  localStorage.setItem("linkHubUser", JSON.stringify(user));
}

function logout() {
  localStorage.removeItem("linkHubUser");
  location.href = "/linkhub/login.html";
}

function setThemeColor(color) {
  document.documentElement.style.setProperty("--theme-color", color || "#7c3aed");
}

function uniqueId() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "id-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

async function register() {
  const username = document.getElementById("registerUsername")?.value.trim();
  const password = document.getElementById("registerPassword")?.value.trim();
  const message = document.getElementById("registerMessage");

  try {
    const res = await fetch(`${API_BASE}/api/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (message) message.textContent = data.message || data.error || "";

    if (res.ok) {
      document.getElementById("registerUsername").value = "";
      document.getElementById("registerPassword").value = "";
    }
  } catch (err) {
    console.error(err);
    if (message) message.textContent = "Erro ao conectar com a API.";
  }
}

async function login() {
  const username = document.getElementById("loginUsername")?.value.trim();
  const password = document.getElementById("loginPassword")?.value.trim();
  const message = document.getElementById("loginMessage");

  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (message) message.textContent = data.message || data.error || "";

    if (res.ok && data.user) {
      setStoredUser(data.user);
      location.href = "/linkhub/dashboard.html";
    }
  } catch (err) {
    console.error(err);
    if (message) message.textContent = "Erro ao conectar com a API.";
  }
}

async function uploadAvatar() {
  const user = getStoredUser();
  if (!user) return;

  const fileInput = document.getElementById("avatarFileInput");
  const saveMessage = document.getElementById("saveMessage");
  const file = fileInput?.files?.[0];

  if (!file) {
    if (saveMessage) saveMessage.textContent = "Selecione uma imagem primeiro.";
    return;
  }

  try {
    const form = new FormData();
    form.append("avatar", file);

    const res = await fetch(
      `${API_BASE}/api/upload-avatar?slug=${encodeURIComponent(user.slug)}`,
      {
        method: "POST",
        body: form
      }
    );

    const data = await res.json();
    if (saveMessage) saveMessage.textContent = data.message || data.error || "";

    if (res.ok) {
      const updated = { ...user, avatar: data.avatar };
      setStoredUser(updated);

      const avatarInput = document.getElementById("avatarInput");
      if (avatarInput) avatarInput.value = data.avatar;

      refreshPreview();
    }
  } catch (err) {
    console.error(err);
    if (saveMessage) saveMessage.textContent = "Erro ao enviar avatar.";
  }
}

function createLinkEditorItem(
  link = { id: uniqueId(), title: "", url: "", icon: "🔗", clicks: 0 }
) {
  const wrapper = document.createElement("div");
  wrapper.className = "link-editor-item";
  wrapper.draggable = true;
  wrapper.dataset.id = link.id || uniqueId();

  wrapper.innerHTML = `
    <input class="input link-title" placeholder="Título do link" value="${link.title || ""}">
    <input class="input link-url" placeholder="URL do link" value="${link.url || ""}">
    <input class="input link-icon" placeholder="Ícone / emoji" value="${link.icon || "🔗"}">
    <div class="subtle">Cliques: <span class="link-clicks">${Number(link.clicks || 0)}</span></div>
    <button class="btn ghost-btn remove-link-btn" type="button">Remover</button>
  `;

  wrapper.querySelector(".remove-link-btn").addEventListener("click", () => {
    wrapper.remove();
    refreshPreview();
  });

  wrapper.querySelectorAll("input").forEach(input => {
    input.addEventListener("input", refreshPreview);
  });

  wrapper.addEventListener("dragstart", () => {
    wrapper.classList.add("dragging");
  });

  wrapper.addEventListener("dragend", () => {
    wrapper.classList.remove("dragging");
  });

  return wrapper;
}

function setupDragAndDrop() {
  const editor = document.getElementById("linksEditor");
  if (!editor) return;

  editor.addEventListener("dragover", e => {
    e.preventDefault();
    const dragging = editor.querySelector(".dragging");
    if (!dragging) return;

    const siblings = [...editor.querySelectorAll(".link-editor-item:not(.dragging)")];

    const nextSibling = siblings.find(sibling => {
      const rect = sibling.getBoundingClientRect();
      return e.clientY <= rect.top + rect.height / 2;
    });

    editor.insertBefore(dragging, nextSibling || null);
  });
}

function addLinkField(link) {
  const linksEditor = document.getElementById("linksEditor");
  if (!linksEditor) return;

  linksEditor.appendChild(createLinkEditorItem(link));
  refreshPreview();
}

function collectLinksFromEditor() {
  const items = document.querySelectorAll(".link-editor-item");
  const links = [];

  items.forEach(item => {
    const title = item.querySelector(".link-title")?.value.trim();
    const url = item.querySelector(".link-url")?.value.trim();
    const icon = item.querySelector(".link-icon")?.value.trim() || "🔗";
    const clicks = Number(item.querySelector(".link-clicks")?.textContent || 0);

    if (title && url) {
      links.push({
        id: item.dataset.id,
        title,
        url,
        icon,
        clicks
      });
    }
  });

  return links;
}

function buildPrettyPublicLink(user) {
  if (user.customDomain) {
    return `https://${user.customDomain}`;
  }
  return `https://juliontb.site/linkhub/user/${encodeURIComponent(user.slug)}`;
}

function renderPreview(user) {
  const previewCard = document.getElementById("previewCard");
  if (!previewCard) return;

  setThemeColor(user.themeColor || "#7c3aed");

  const previewAvatar = document.getElementById("previewAvatar");
  const previewUsername = document.getElementById("previewUsername");
  const previewBio = document.getElementById("previewBio");
  const publicUrl = document.getElementById("publicUrl");
  const previewLinks = document.getElementById("previewLinks");

  if (previewAvatar) previewAvatar.src = user.avatar || "";
  if (previewUsername) previewUsername.textContent = user.username || "";
  if (previewBio) previewBio.textContent = user.bio || "";
  if (publicUrl) publicUrl.textContent = buildPrettyPublicLink(user);

  if (previewLinks) {
    previewLinks.innerHTML = "";

    (user.links || []).forEach(link => {
      const a = document.createElement("a");
      a.className = "link-btn";
      a.href = "#";
      a.innerHTML = `${link.icon || "🔗"} ${link.title}`;
      a.style.borderColor = `${user.themeColor}55`;
      previewLinks.appendChild(a);
    });
  }

  previewCard.style.boxShadow = `0 20px 60px ${user.themeColor}33`;
  previewCard.style.borderColor = `${user.themeColor}55`;

  const totalClicks = (user.links || []).reduce(
    (sum, item) => sum + Number(item.clicks || 0),
    0
  );

  const statVisits = document.getElementById("statVisits");
  const statUnique = document.getElementById("statUnique");
  const statClicks = document.getElementById("statClicks");

  if (statVisits) statVisits.textContent = user.analytics?.visits || 0;
  if (statUnique) statUnique.textContent = user.analytics?.uniqueVisitors || 0;
  if (statClicks) statClicks.textContent = totalClicks;
}

function refreshPreview() {
  const stored = getStoredUser();
  if (!stored) return;

  const themeId = document.getElementById("themeSelect")?.value || "purple";
  const themeColor = THEMES[themeId]?.color || "#7c3aed";

  renderPreview({
    ...stored,
    avatar: document.getElementById("avatarInput")?.value.trim() || stored.avatar,
    bio: document.getElementById("bioInput")?.value.trim() || "",
    customDomain: document.getElementById("customDomainInput")?.value.trim() || "",
    themeId,
    themeColor,
    links: collectLinksFromEditor()
  });
}

async function saveProfile() {
  const stored = getStoredUser();
  if (!stored) return;

  const themeId = document.getElementById("themeSelect")?.value || "purple";
  const themeColor = THEMES[themeId]?.color || "#7c3aed";

  const payload = {
    slug: stored.slug,
    avatar: document.getElementById("avatarInput")?.value.trim() || stored.avatar,
    bio: document.getElementById("bioInput")?.value.trim() || "",
    customDomain: document.getElementById("customDomainInput")?.value.trim() || "",
    themeId,
    themeColor,
    links: collectLinksFromEditor()
  };

  try {
    const res = await fetch(`${API_BASE}/api/update-profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    const saveMessage = document.getElementById("saveMessage");

    if (saveMessage) saveMessage.textContent = data.message || data.error || "";

    if (res.ok) {
      setStoredUser({
        ...data.user,
        analytics: stored.analytics || data.user.analytics
      });
      refreshPreview();
    }
  } catch (err) {
    console.error(err);
    const saveMessage = document.getElementById("saveMessage");
    if (saveMessage) saveMessage.textContent = "Erro ao salvar perfil.";
  }
}

function copyPublicLink() {
  const stored = getStoredUser();
  if (!stored) return;

  const url = buildPrettyPublicLink(stored);

  navigator.clipboard
    .writeText(url)
    .then(() => {
      const saveMessage = document.getElementById("saveMessage");
      if (saveMessage) saveMessage.textContent = "Link copiado.";
    })
    .catch(err => {
      console.error(err);
    });
}

function loadDashboard() {
  const user = getStoredUser();
  if (!user) {
    location.href = "/linkhub/login.html";
    return;
  }

  const avatarInput = document.getElementById("avatarInput");
  const bioInput = document.getElementById("bioInput");
  const customDomainInput = document.getElementById("customDomainInput");
  const themeSelect = document.getElementById("themeSelect");
  const linksEditor = document.getElementById("linksEditor");

  if (avatarInput) avatarInput.value = user.avatar || "";
  if (bioInput) bioInput.value = user.bio || "";
  if (customDomainInput) customDomainInput.value = user.customDomain || "";
  if (themeSelect) themeSelect.value = user.themeId || "purple";

  setThemeColor(user.themeColor || THEMES.purple.color);

  if (linksEditor) {
    linksEditor.innerHTML = "";

    if (user.links && user.links.length) {
      user.links.forEach(link => addLinkField(link));
    } else {
      addLinkField();
    }
  }

  setupDragAndDrop();

  avatarInput?.addEventListener("input", refreshPreview);
  bioInput?.addEventListener("input", refreshPreview);
  customDomainInput?.addEventListener("input", refreshPreview);
  themeSelect?.addEventListener("change", refreshPreview);

  renderPreview(user);
}

function getSlugFromPage() {
  const params = new URLSearchParams(location.search);

  if (params.get("slug")) {
    return params.get("slug").trim();
  }

  const path = location.pathname.replace(/^\/+/, "").trim();

  if (
    path &&
    path !== "index.html" &&
    path !== "login.html" &&
    path !== "dashboard.html" &&
    path !== "admin.html" &&
    path !== "user.html" &&
    !path.includes(".")
  ) {
    return path;
  }

  return "";
}

async function resolveCustomDomainSlug() {
  try {
    const currentHost = location.hostname.toLowerCase();

    if (
      currentHost === "juliontb.site" ||
      currentHost === "www.juliontb.site" ||
      currentHost === "localhost" ||
      currentHost === "127.0.0.1"
    ) {
      return "";
    }

    const res = await fetch(
      `${API_BASE}/api/resolve-domain?host=${encodeURIComponent(currentHost)}`
    );

    const data = await res.json();

    if (res.ok && data.slug) {
      return data.slug;
    }

    return "";
  } catch (err) {
    console.error(err);
    return "";
  }
}

async function loadPublicProfile() {
  let slug = getSlugFromPage();

  if (!slug) {
    slug = await resolveCustomDomainSlug();
  }

  if (!slug) return;

  try {
    const res = await fetch(`${API_BASE}/api/user/${encodeURIComponent(slug)}`);
    const data = await res.json();

    if (!res.ok) {
      document.body.innerHTML = `
        <div class="page public-page">
          <div class="public-profile">
            <h1>Perfil não encontrado</h1>
          </div>
        </div>
      `;
      return;
    }

    setThemeColor(data.themeColor || THEMES.purple.color);

    const publicProfile = document.getElementById("publicProfile");
    const publicAvatar = document.getElementById("publicAvatar");
    const publicUsername = document.getElementById("publicUsername");
    const publicBio = document.getElementById("publicBio");
    const publicLinks = document.getElementById("publicLinks");

    if (publicProfile) {
      publicProfile.style.boxShadow = `0 20px 60px ${data.themeColor}33`;
      publicProfile.style.borderColor = `${data.themeColor}55`;
    }

    if (publicAvatar) publicAvatar.src = data.avatar;
    if (publicUsername) publicUsername.textContent = data.username;
    if (publicBio) publicBio.textContent = data.bio || "";

    document.title = `${data.username} - LinkHub Pro`;

    await fetch(`${API_BASE}/api/visit/${encodeURIComponent(data.slug)}`, {
      method: "POST"
    });

    if (publicLinks) {
      publicLinks.innerHTML = "";

      (data.links || []).forEach(link => {
        const a = document.createElement("a");
        a.className = "link-btn";
        a.href = "#";
        a.innerHTML = `${link.icon || "🔗"} ${link.title}`;
        a.style.borderColor = `${data.themeColor}55`;

        a.addEventListener("click", async e => {
          e.preventDefault();

          try {
            const clickRes = await fetch(
              `${API_BASE}/api/click/${encodeURIComponent(data.slug)}/${encodeURIComponent(link.id)}`,
              { method: "POST" }
            );

            const clickData = await clickRes.json();

            if (clickRes.ok && clickData.url) {
              window.open(clickData.url, "_blank", "noopener,noreferrer");
            }
          } catch (err) {
            console.error(err);
          }
        });

        publicLinks.appendChild(a);
      });
    }
  } catch (err) {
    console.error(err);
  }
}

async function adminLogin() {
  const username = document.getElementById("adminUsername")?.value.trim();
  const password = document.getElementById("adminPassword")?.value.trim();
  const message = document.getElementById("adminLoginMessage");

  try {
    const res = await fetch(`${API_BASE}/api/admin-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (message) message.textContent = data.message || data.error || "";

    if (res.ok) {
      localStorage.setItem("linkHubAdmin", "true");
      document.getElementById("adminLoginBox")?.classList.add("hidden");
      document.getElementById("adminPanel")?.classList.remove("hidden");
      loadAdminUsers();
    }
  } catch (err) {
    console.error(err);
    if (message) message.textContent = "Erro no login admin.";
  }
}

function adminLogout() {
  localStorage.removeItem("linkHubAdmin");
  location.reload();
}

async function loadAdminUsers() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/users`);
    const data = await res.json();
    const list = document.getElementById("adminUsersList");

    if (!list) return;

    list.innerHTML = "";

    (data.users || []).forEach(user => {
      const div = document.createElement("div");
      div.className = "admin-user-card";
      div.innerHTML = `
        <h3>${user.username}</h3>
        <p>Slug: ${user.slug}</p>
        <p>Domínio: ${user.customDomain || "Não definido"}</p>
        <p>Visitas: ${user.visits}</p>
        <p>Visitantes únicos: ${user.uniqueVisitors}</p>
        <p>Total de cliques: ${user.totalClicks}</p>
        <button class="btn ghost-btn">Remover usuário</button>
      `;

      div.querySelector("button").addEventListener("click", async () => {
        const del = await fetch(
          `${API_BASE}/api/admin/delete-user/${encodeURIComponent(user.slug)}`,
          {
            method: "DELETE"
          }
        );

        const result = await del.json();
        alert(result.message || result.error || "");
        loadAdminUsers();
      });

      list.appendChild(div);
    });
  } catch (err) {
    console.error(err);
  }
}

function bootAdmin() {
  const isAdmin = localStorage.getItem("linkHubAdmin") === "true";

  if (isAdmin) {
    document.getElementById("adminLoginBox")?.classList.add("hidden");
    document.getElementById("adminPanel")?.classList.remove("hidden");
    loadAdminUsers();
  }
}

if (location.pathname.endsWith("/linkhub/dashboard.html")) {
  loadDashboard();
}

if (location.pathname.endsWith("/linkhub/admin.html")) {
  bootAdmin();
}

if (
  location.pathname.endsWith("/linkhub/user.html") ||
  (
    !location.pathname.endsWith("/linkhub/login.html") &&
    !location.pathname.endsWith("/linkhub/dashboard.html") &&
    !location.pathname.endsWith("/linkhub/admin.html")
  )
) {
  loadPublicProfile();
}
