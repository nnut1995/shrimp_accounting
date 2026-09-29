# Discord accounting assistant on Mac mini

Target: https://discord.com/channels/1499980328671117442/1553341707008090122

## Start

Requires Node 22.12+, Codex CLI with `codex login` completed, and the existing accounting login.

1. Create a Discord application named **Shrimp Accounting** in https://discord.com/developers/applications.
2. Under **Bot**, enable **Message Content Intent**. Obtain a bot token (never a personal Discord token).
3. Run `npm run discord:setup`. Open the printed **127.0.0.1** link on this Mac. Enter the bot token and existing accounting email/password. Optional Discord user IDs are comma-separated; leaving blank permits only the server owner.
4. Setup verifies the token and read-only accounting access, saves private configuration, and provides an invite for the configured server. Invite the bot. It needs View Channel, Send Messages, Read Message History, Attach Files, Create Public Threads, and Send Messages in Threads. It does not need Administrator, Manage Server or Manage Messages. In server/channel permissions, restrict the bot's visibility to the accounting channel.
5. Run `npm run discord:start` for a foreground check. It validates the channel, permissions and accounting access before accepting jobs.
6. For continuous operation, use `pm2 start scripts/discord-bot/ecosystem.config.cjs`. Do not also run the foreground bot. A singleton lock prevents two bot processes on this Mac. For this Mac, `node scripts/discord-bot/install-startup.mjs` installs `~/Library/LaunchAgents/com.natn.shrimp-discord-bot.plist`. Load it with `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.natn.shrimp-discord-bot.plist`. It starts only this bot at user login and does not replace the saved PM2 process list. PM2 supervises the bot after startup.

## Mobile workflow

Send one lot's photos and instructions in the configured channel. The bot opens a public thread, limited by the channel's visibility. Continue that lot in the thread. JPG, PNG and WebP are accepted, up to 12 MB each and 10 images per draft. PDFs and HEIC must be converted first.

Only allowlisted users (default: server owner) can trigger jobs, and only the lot's original sender can edit or confirm its draft. Check the Thai summary and complete row-by-row text attachment, then press **ยืนยันบันทึก**. Sending a correction invalidates every old confirmation button. The create or update request is executed by the bot, not by model-generated commands. The final link points to the saved lot.

- `ช่วยเหลือ` / `help`: usage instructions.
- `สถานะ`: current status; reissues the latest confirmation button if needed, including after a restart.
- `ลองใหม่`: retry analysis after a failure.
- `ผูกล็อต <lot URL or UUID>` / `link <lot URL or UUID>`: link an existing lot. Send this in the main channel to create its thread, or in an unlinked draft thread. A linked thread cannot switch lots; a lot already linked elsewhere points you to its existing thread.
- **ยกเลิกร่าง**: close an unsubmitted draft.

A frozen write with an unknown result can only retry the exact same idempotency key and payload. It cannot be edited or cancelled because the server may already have committed it. A retry receipt is persisted before posting the success message. The bot never automatically retries a write at startup.

## Current limits

Each thread permanently refers to one lot. After saving, send corrections or later sales in the same thread; the bot reads the latest saved lot, preserves unchanged data in the proposed full draft, and asks for confirmation again. Cancelling an edit leaves the saved lot unchanged and keeps the thread usable. Existing saved bot jobs recover their lot links automatically on restart. The original sender remains the only editor/approver.

A same-date/same-supplier existing lot still blocks a new create; use the explicit link command to edit it. The bot never guesses which existing lot you mean. Separate genuine lots sharing supplier/date still require website creation. Deletion is not supported.

If the website or another client changes the lot after drafting, confirmation is rejected without overwriting it. Send the correction again to draft from the latest data. Unknown write outcomes remain frozen and retry the same target, version, payload and key. Confirmation buttons from old drafts never apply to later edits.

Identical uploaded image bytes are detected across stored jobs. Different crops or re-encoded photos can have different hashes, so the accounting duplicate check remains necessary. One message in the main channel starts one lot/thread; send additional pages inside that thread. The bot does not backfill messages sent while offline. After a restart, interrupted analysis is marked failed; send `ลองใหม่` in its thread. Queue contents that had not reached persistent processing may require resending the message. Maximum 20 waiting/running messages; jobs are serialized to preserve draft/confirmation ordering.

Mac mini must remain awake, online and logged into the service account. Reboot startup depends on the machine's PM2/launchd configuration. CLI login expiration or usage limits stop analysis until resolved locally.

## Enable saved-lot editing

Apply `supabase/migrations/202609270001_accounting_lot_updates.sql`, deploy the updated Next.js API, then restart `shrimp-discord-bot` through its process manager. Until the API and migration are available, existing-lot reads fail safely and no replacement lot is created. Production rollout completed on 2026-09-27: migration applied, API deployed, bot restarted and ready, and both existing saved thread links restored. Local tests alone do not perform deployment.

## Local data and credentials

`.discord-bot/` is ignored by Git. `config.json` contains bot/accounting credentials with mode 0600. `state.json` and `images/` retain notebook sources and job state for audit/recovery. Keep this folder private and backed up; deleting it loses duplicate detection, draft ownership and idempotent retry history. Do not upload this folder or commit credentials.

The temporary setup form binds to 127.0.0.1, uses an unguessable path and validates Host/Origin. It does not serve through Next.js or public hosting, never prefills secrets, and exits after an hour. Close it after setup.

Codex runs through `codex exec` without shell interpolation. Each analysis receives the domain references, durable conversation history and original images. It uses an ephemeral read-only run with shell, apps, plugins, browser, hooks and multi-agent tools disabled; it does not inherit the bot/accounting environment. No desktop conversation history is copied automatically. Saved CLI authentication is reused, and no model override is imposed. Accounting requests run separately with the existing user's Supabase login and RLS permissions.

The bot announces readiness once on initial installation. Reconnects/restarts do not post repetitive status announcements. Model output and outbound text disable Discord mentions. Raw process logs are not forwarded to the chat.

## Verification

`npm run test:discord` tests authorization boundaries, draft validation, explicit fees, stale confirmation rejection, duplicate-lot protection, write-ahead persistence, timeout/restart idempotency, payload freezing, private state files, singleton execution and attachment host/file validation. `npm run test:api` covers the existing API. Live end-to-end validation requires the real bot token, channel permissions and accounting login. Use a read-only help/clarification test first; do not insert artificial lots into production.
