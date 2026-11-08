// Shared by every page: nav, footer, links from plugins.json (built by scripts/site-data.mjs).
(() => {
  const PAGES = [["/download/", "Download"], ["/plugins/", "Plugins"], ["/store/", "Store"], ["/faq/", "FAQ"]];
  const here = location.pathname.replace(/index\.html$/, "");

  const nav = document.createElement("header");
  nav.className = "nav";
  nav.innerHTML = `<div class="wrap">
    <a class="brand" href="/"><img src="/logo.png" alt="">Vanta</a>
    <button class="menu" type="button" aria-label="Menu" aria-expanded="false"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
    <nav aria-label="Main">${PAGES.map(([href, label]) => `<a href="${href}"${here === href ? ' aria-current="page"' : ""}>${label}</a>`).join("")}<a data-link="discord" href="#" hidden>Discord</a></nav>
  </div>`;
  document.body.prepend(nav);
  const menu = nav.querySelector(".menu");
  menu.onclick = () => menu.setAttribute("aria-expanded", String(nav.classList.toggle("open")));

  const foot = document.createElement("footer");
  foot.innerHTML = `<div class="wrap"><a data-link="github" href="#">Source code</a> — Discord is a trademark of Discord Inc. Vanta is not affiliated with or endorsed by Discord Inc.</div>`;
  document.body.append(foot);

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  window.Vanta = fetch("/plugins.json", { cache: "no-store" })
    .then(r => r.json())
    .catch(() => ({ plugins: [], repo: "praisezu/Vanta", discord: "", version: "" }))
    .then(data => {
      const gh = `https://github.com/${data.repo || "praisezu/Vanta"}`;
      const dl = `${gh}/releases/latest/download/`;
      const links = {
        github: gh, releases: `${gh}/releases`, discord: data.discord, submit: `${gh}/blob/main/store/README.md`,
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
