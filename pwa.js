(() => {
  "use strict";
  let installPrompt = null;
  const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  function updateInstallButton(button) {
    if (!button) return;
    if (isInstalled()) {
      button.innerHTML = "✓ <span>App installed</span>";
      button.disabled = true;
      button.setAttribute("aria-label", "App already installed");
    } else {
      button.disabled = false;
    }
  }
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
  });
  // Settings content is rendered dynamically, so use delegated click handling.
  document.addEventListener("click", async event => {
    const button = event.target.closest("#installAppButton");
    if (!button) return;
    updateInstallButton(button);
    // Staff installs must begin at a staff-specific manifest/start URL, not the Owner app root.
    let staffMode = false;
    try { const s = JSON.parse(localStorage.getItem("ticketdesk-staff-session-v1") || "null"); staffMode = !!(s && typeof s.name === "string" && ["sales","entry","playing","event","leader"].includes(s.department)); } catch {}
    if (staffMode && !isInstalled()) { window.location.href = "./staff-install.html"; return; }
    if (isInstalled()) {
      alert("Ticket Desk is already installed on your home screen.");
      return;
    }
    if (installPrompt) {
      installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      installPrompt = null;
      if (choice && choice.outcome === "accepted") {
        button.innerHTML = "✓ <span>App installed</span>";
        button.disabled = true;
      }
      return;
    }
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/i.test(ua)) {
      alert('To add Ticket Desk to your Home Screen: tap Share in Safari, then choose “Add to Home Screen”.');
    } else {
      alert('To install Ticket Desk: open the browser menu (⋮) and choose “Install app” or “Add to Home screen”. If that option is missing, refresh the website and try again.');
    }
  });
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(error => console.warn("App offline setup unavailable:", error)));
  }
})();