# Ticket Desk — Ticket Management Website

A responsive English/Thai ticket management app built with HTML5, CSS3 and vanilla JavaScript.

## Files
- `index.html` — app shell and navigation
- `style.css` — responsive navy, white and champagne-gold design
- `app.js` — IndexedDB data layer, ticket management, daily quantities, reports, backup/restore

## Run it
IndexedDB works best when served from a local web server. From this folder, run:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000` in a browser. On a phone, use a development server reachable on the same Wi-Fi or deploy the files to a static host. No build step or framework is required.

## Using the app
1. The Dashboard opens first. Pick a date to see totals for that date only.
2. Open any of the four department pages. Each department has its own inventory and daily records. Eighteen blank starter slots are created per department; add more ticket types whenever needed.
3. Add a ticket name, optional image, daily quantity and notes. Use JPG, PNG or WebP images. On supported phones, the file chooser may offer the camera.
4. Change the selected date before entering a different day's quantities. Quantities are stored per ticket and date.
5. Use **Save daily report** to create a historical snapshot. If one already exists for that department/date, choose whether to replace the latest report or save another version.
6. Open **Reports / Save Albums** to search, filter, view, print/save as PDF, export CSV or delete saved reports. Reports remain separate by department.
7. Open **Backup & Restore** to export a JSON backup containing records, report snapshots and embedded image data. Importing replaces current data after confirmation; keep a backup first.

## Storage and limitations
- Ticket records, date-specific quantities, reports and image data are stored in IndexedDB in the current browser profile.
- The selected language is stored in localStorage.
- There is no cloud sync or authentication in this version. Data is not automatically shared across devices or browsers. Export backups regularly.
- Clearing browser site data can erase local data. Store exported backups somewhere safe.
- Large images are resized to a maximum dimension of 2200px before saving. PNG remains PNG; other supported images are saved as JPEG to reduce storage use.
- Historical reports embed image data and copy ticket names/quantities, so they remain stable if the original ticket changes or is deleted.
- The initial 18 slots are blank starter slots rather than ticket records. Named tickets count toward ticket-type statistics.

## QA checklist
Manual implementation checks covered in the source:
- Dashboard-first navigation and date-specific totals
- English/Thai interface dictionaries and instant language switching
- Four department-specific ticket stores and albums
- 18 starter slots per department and unlimited additional records
- Image upload, containment preview and IndexedDB persistence
- Non-negative integer validation for quantities
- Date-keyed daily quantity records
- Immutable report snapshots with duplicate-date warning/versioning
- Report search/date filters, print-to-PDF window and CSV export
- JSON backup/restore with schema and record validation
- Responsive desktop/mobile CSS

This source has not been executed in every target browser. Test with a non-production sample dataset and keep a backup before relying on it for workplace records.
