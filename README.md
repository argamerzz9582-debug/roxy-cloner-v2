<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=transparent&fontColor=ff0000&text=Roxy%20cloner%20v2&fontSize=40&height=100&descAlignY=50&descAlign=50" alt="Roxy cloner v2" />
</p>

<p align="center">
  Clone a Discord server's channels, roles and emoji into another server from a chat command.
</p>

---

## ⚠️ Read this first

- **This uses a selfbot.** `DC_TOKEN` is your *own account* token, used to read the source server with `discord.js-selfbot-v13`. Automating a user account **violates Discord's Terms of Service** and can get that account terminated. That is a risk of the design, not something this repo can fix. Use a throwaway account you can afford to lose.
- **Options 1–3 are destructive and irreversible.** They wipe channels, roles and emoji in the *target* server. There is no undo. The UI requires a second explicit confirmation, and `DRY_RUN=true` lets you rehearse without touching anything.
- **Check the ids twice.** `!clone <source> <target>` — a swapped pair can wipe the server you meant to copy *from*.

## Features

| | |
|---|---|
| 🗂️ **Channels** | Categories, text, announcement, voice, stage, forum and media channels, with topics, slowmode, NSFW, bitrate (clamped to the target's boost level) and user limits |
| 🎭 **Roles** | Name, colour, hoist, mentionable, permissions, unicode emoji, cloned in hierarchy order |
| 😄 **Emoji** | Static and animated, planned against the target's real slot budget per boost tier |
| 🔐 **Permissions** | Channel overwrites remapped role→role (`@everyone` included); member overwrites kept when that user is in the target |
| 🧾 **Safety** | Two-step confirmation for destructive options, dry-run mode, protected log channel, per-run summary |
| 📊 **Reporting** | Live batched progress in-channel, then a summary embed **and** a DM with created/deleted/failed counts |
| 🔁 **Resilience** | Retries with Discord's `retry_after`, aborts a phase after repeated permission errors instead of spamming |
| 🧪 **Tested** | 86 unit + integration tests (`npm test`) covering the pure logic and a full simulated clone run |

## Requirements

- **Node.js 20+** (22 recommended)
- A Discord **bot** with *Administrator* in the **target** server, whose role sits **at the top** of the target's role list
- Your **user account** in the **source** server
- Server Members + Message Content intents enabled for the bot

## Setup

```bash
git clone <this-repo>
cd roxy-cloner-v2
npm install
cp .env.example .env
```

Fill in `.env`:

| Variable | Required | Description |
|---|---|---|
| `BOT_TOKEN` | ✅ | Bot token from the [Developer Portal](https://discord.com/developers/applications) → Bot. Used to **write** the target. |
| `DC_TOKEN` | ✅ | Your own account token. Used to **read** the source. See the warning above. |
| `ALLOWED_ID` | ✅ | Who may run `!clone`. One or more user ids, comma separated. This is the only authorization gate. |
| `CLONE_DELAY_MS` | – | Pause between API calls. Default `750`, clamped to `0–10000`. Lower is faster and riskier. |
| `DRY_RUN` | – | `true` simulates everything and reports what *would* happen. |
| `MAX_EMOJIS_PER_RUN` | – | Hard cap on emoji cloned per run. |
| `LOG_LEVEL` | – | `debug` \| `info` \| `warn` \| `error` \| `silent`. |

Then:

```bash
npm start
```

### Bot permissions checklist

1. Invite the bot with `scope=bot applications.commands` and the **Administrator** permission.
2. In the target server: **Server Settings → Roles → drag the bot's role to the very top.** Discord will not let a bot create or delete roles above its own.
3. Enable **Message Content** and **Server Members** intents in the Developer Portal (without them `!clone` will never be seen).

## Usage

```
!clone <source_server_id> <target_server_id>
!help
```

Enable **Developer Mode** (User Settings → Advanced), then right-click a server → *Copy Server ID*.

The command replies with a menu of six toggles:

| # | Option | Destructive |
|---|---|---|
| 1 | Delete channels | ⚠️ |
| 2 | Delete roles | ⚠️ |
| 3 | Delete emojis | ⚠️ |
| 4 | Clone channels | |
| 5 | Clone roles | |
| 6 | Clone emojis | |

Pick what you want, press **Start cloning**. If any of 1–3 are on, you get a red confirmation screen showing exactly what will be deleted, with **Confirm wipe** / **Back** / **Cancel**. The menu is scoped to the person who ran the command and times out after 10 minutes.

Phases run in this order: wipe channels → wipe roles → wipe emoji → clone roles → clone channels → clone emoji (roles must exist before channel overwrites can reference them).

The channel you ran the command in is **protected for the whole run** and deleted last, so progress keeps flowing. A summary embed is posted there and also DM'd to you, since the channel may no longer exist afterwards.

## Running from GitHub Actions

`.github/workflows/cloner.yml` runs on `workflow_dispatch`, with a **Verify** job (`npm run check`, `npm test`) before the 90-minute **Run cloner** job, plus a `dry_run` input.

Add repository secrets `BOT_TOKEN`, `DC_TOKEN`, `ALLOWED_ID` (optional variables: `CLONE_DELAY_MS`, `LOG_LEVEL`).

> Note: Discord often blocks or challenges logins from datacenter IPs. If login fails on Actions, run it locally.

## Architecture

```
index.js                 entry point: banner, config validation, login, shutdown
src/
  app.js                 clients, command routing, preflight validation
  config.js              .env loading
  logger.js              leveled/colourised logging
  notifier.js            batched Discord log sink with DM failover
  banner.js              the ASCII banner
  cloner/
    index.js             runClone(): phase plan, summary, DM
    runner.js            shared state: id maps, pacing, retries, abort logic
    cleanup.js           channel/role/emoji wipes + protected-channel removal
    roles.js             role cloning
    channels.js          category + channel cloning
    emojis.js            emoji cloning within slot budget
  lib/                   pure, dependency-free logic (unit-tested)
    config.js errors.js retry.js time.js report.js roles.js channels.js
    overwrites.js emojis.js
  ui/
    options.js           the six options, one source of truth
    embeds.js            menu / confirm / summary / help embeds
    cloneMenu.js         button collector + confirmation state machine
test/                    86 tests (node:test, no extra dependencies)
```

Everything mutating goes through `CloneRunner.mutate()`, which applies retries, pacing, dry-run short-circuiting, failure counting and log fan-out in one place.

## Testing

```bash
npm test          # 86 tests, no network, no tokens needed
npm run check     # syntax check every file
```

`test/cloneRun.test.js` drives the real pipeline against fake guild objects, so a full "delete → clone → report" run is verified without touching Discord.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Bot logs in, `!clone` does nothing | Message Content intent is off, or your id is not in `ALLOWED_ID` |
| "The user account cannot access the source server" | `DC_TOKEN` is not a member of the source |
| "The bot needs Administrator" | Grant it via the bot's role, not a channel override |
| "The bot's role is not at the top of the role list" | Drag the bot's role above every other role |
| Roles cloned but in the wrong order | Something else created roles mid-run; re-run option 5 |
| Emoji stop early | Discord caps emoji uploads per day, and slots depend on boost tier |
| Phase stops with "consecutive permission errors" | The bot lost access mid-run; re-check its role position |
| Login fails on GitHub Actions | Datacenter IP; run locally |

## Known limitations

- Guild-level settings (name, icon, banner, verification level) are **not** copied — only channels, roles and emoji.
- Messages, threads, pinned content and member assignments are not cloned.
- Role icons and role-style gradients are not copied (they need boost tier 2 + binary icon data).
- Forum tag **emojis** are dropped (tag names and moderation flags are kept).
- Bots can't be granted roles during a clone, so the target's role assignments never match the source.

## License

ISC
