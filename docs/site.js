// Shared by every page: background, nav, footer, motion, and links from plugins.json (built by scripts/site-data.mjs).
(() => {
  const PAGES = [["/download/", "Download"], ["/plugins/", "Plugins"], ["/store/", "Store"], ["/faq/", "FAQ"]];
  const here = location.pathname.replace(/index\.html$/, "");

  const voidEl = document.createElement("div");
  voidEl.className = "void";
  voidEl.setAttribute("aria-hidden", "true");
  voidEl.innerHTML = "<i></i><i></i><i></i>";
  document.body.prepend(voidEl);

  const nav = document.createElement("header");
  nav.className = "nav";
  nav.innerHTML = `<div class="bar glass">
    <a class="brand" href="/"><img src="/logo.png" alt="">Vanta</a>
    <button class="menu" type="button" aria-label="Menu" aria-expanded="false"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 8h16M4 16h16"/></svg></button>
    <nav aria-label="Main">${PAGES.map(([href, label]) => `<a href="${href}"${here === href ? ' aria-current="page"' : ""}>${label}</a>`).join("")}<a data-link="discord" href="#" hidden>Discord</a></nav>
    <a class="btn primary sm get" href="/download/">Get Vanta</a>
  </div>`;
  voidEl.after(nav);
  const menu = nav.querySelector(".menu");
  menu.onclick = () => menu.setAttribute("aria-expanded", String(nav.classList.toggle("open")));

  const foot = document.createElement("footer");
  foot.innerHTML = `<div class="wrap"><span><a data-link="github" href="#">Source</a><a data-link="discord" href="#" hidden>Discord</a><a href="/faq/">FAQ</a></span>
    <span>Not affiliated with or endorsed by Discord Inc.</span></div>`;
  document.body.append(foot);

  // Scroll reveals
  const io = "IntersectionObserver" in window && new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("seen"); io.unobserve(e.target); }
  }, { rootMargin: "0px 0px -8% 0px" });
  for (const el of document.querySelectorAll(".reveal")) io ? io.observe(el) : el.classList.add("seen");

  // Cursor spotlight on glass cards
  document.addEventListener("pointermove", e => {
    const el = e.target.closest?.(".spot");
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, { passive: true });

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  window.Vanta = fetch("/plugins.json", { cache: "no-store" })
    .then(r => r.json())
    .catch(() => ({ plugins: [], repo: "praisezu/Vanta", discord: "", version: "" }))
    .then(data => {
      const gh = `https://github.com/${data.repo || "praisezu/Vanta"}`;
      const dl = `${gh}/releases/latest/download/`;
      const links = {
        github: gh, releases: `${gh}/releases`, release: `${gh}/releases/latest`, discord: data.discord, submit: `${gh}/blob/main/store/README.md`,
        win: dl + "VantaInstaller.exe", linux: dl + "VantaInstaller-linux", mac: dl + "VantaInstaller-macos",
      };
      for (const a of document.querySelectorAll("[data-link]")) {
        const url = links[a.dataset.link];
        if (url) { a.href = url; a.hidden = false; } else if (a.dataset.link === "discord") a.hidden = true;
      }
      for (const el of document.querySelectorAll("[data-count]")) el.textContent = data.plugins.length || "100+";
      for (const el of document.querySelectorAll("[data-version]")) if (data.version) el.textContent = data.version;
      return { ...data, esc, gh };
    });
})();
