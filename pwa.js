(() => {
  "use strict";
  let installPrompt = null;
  const button = document.getElementById("installAppButton");
  const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (isInstalled() && button) {
    button.innerHTML = "✓ <span>App installed</span>";
    button.disabled = true;
    button.setAttribute("aria-label", "App already installed");
  }
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
  });
  if (button) button.addEventListener("click", async () => {
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