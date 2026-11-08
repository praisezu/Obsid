// Shared by every page: nav, footer, motion, and links from plugins.json (built by scripts/site-data.mjs).
(() => {
  const PAGES = [["/download/", "Download"], ["/plugins/", "Plugins"], ["/store/", "Store"], ["/faq/", "FAQ"]];
  const here = location.pathname.replace(/index\.html$/, "");

  const dither = document.createElement("div");
  dither.className = "dither";
  dither.setAttribute("aria-hidden", "true");
  document.body.prepend(dither);

  const nav = document.createElement("header");
  nav.className = "nav";
  nav.innerHTML = `<div class="bar px">
    <a class="brand" href="/"><img src="/logo.png" alt="">VANTA</a>
    <button class="menu" type="button" aria-label="Menu" aria-expanded="false"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" shape-rendering="crispEdges"><path d="M3 6h18v3H3zM3 15h18v3H3z"/></svg></button>
    <nav aria-label="Main">${PAGES.map(([href, label]) => `<a href="${href}"${here === href ? ' aria-current="page"' : ""}>${label}</a>`).join("")}<a data-link="discord" href="#" hidden>Discord</a></nav>
    <a class="btn primary sm get" href="/download/">Get Vanta</a>
  </div>`;
  dither.after(nav);
  const menu = nav.querySelector(".menu");
  menu.onclick = () => menu.setAttribute("aria-expanded", String(nav.classList.toggle("open")));

  const foot = document.createElement("footer");
  foot.innerHTML = `<div class="wrap">
    <a class="brand" href="/" style="margin:0"><img src="/logo.png" alt="">VANTA</a>
    <span><a data-link="github" href="#">Source</a><a data-link="discord" href="#" hidden>Discord</a><a href="/faq/">FAQ</a></span>
    <span>Not affiliated with Discord Inc.</span></div>`;
  document.body.append(foot);

  // Scroll reveals
  const io = "IntersectionObserver" in window && new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("seen"); io.unobserve(e.target); }
  }, { rootMargin: "0px 0px -8% 0px" });
  for (const el of document.querySelectorAll(".reveal")) io ? io.observe(el) : el.classList.add("seen");

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
