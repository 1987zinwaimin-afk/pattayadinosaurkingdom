/* One-time migration: restore English as the default language after the Thai-default test.
   Users can still choose Thai manually; their choice is then saved normally. */
(function () {
  try {
    const migrationKey = "ticketdesk-language-default-en-migrated-v1";
    if (localStorage.getItem(migrationKey) !== "1") {
      localStorage.setItem("ticketdesk-language", "en");
      localStorage.setItem(migrationKey, "1");
    }
  } catch (error) {
    console.warn("Could not initialize the default language preference.", error);
  }
})();