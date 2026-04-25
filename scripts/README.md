# scripts/

One-off utilities. Not part of the running app — invoke manually with `node scripts/<file>.js`.

## migrations/
Schema/data migrations that have already been run against production. Kept here as history. Re-running should be safe (idempotent / no-op on second run) but verify before touching live data.

- `backfill-invoices-folders.js` — backfills `google_drive_file_id` / Drive folder IDs onto existing invoices.
- `migrate-activity-logs.js` — creates per-client Activity Log Google Docs and links via `clients.activity_doc_id`.
- `migrate-meeting-folders.js` — creates per-meeting Drive subfolders and links via `meetings.meet_space_name`.
- `seed-campaigns.js` — seeds default email/SMS campaign templates.

## Drive utilities
- `test-drive.js` — Drive API smoke test.
- `create_event.js` — manual Google Calendar event creation.
- `organize_crm_folders.js` — bulk CRM Drive folder cleanup.
- `split_archives.js` — split large archive exports.
