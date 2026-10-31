<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=transparent&fontColor=ff0000&text=Roxy%20cloner%20v2&fontSize=40&height=100&descAlignY=50&descAlign=50" alt="Roxy cloner v2" />
</p>

<p align="center">
  Clone a Discord server's channels, roles and emoji into another server from a chat command.
</p>

---

## Table of contents

- [Before you start (read this)](#before-you-start-read-this)
- [What it clones](#what-it-clones)
- [Requirements](#requirements)
- [Part 1 — Install](#part-1--install)
- [Part 2 — Create the bot](#part-2--create-the-bot)
- [Part 3 — Get your account token](#part-3--get-your-account-token)
- [Part 4 — Configure](#part-4--configure)
- [Part 5 — Run it](#part-5--run-it)
- [After the clone](#after-the-clone)
- [Reference: commands, options, env vars](#reference-commands-options-env-vars)
- [Running from GitHub Actions](#running-from-github-actions)
- [How it works](#how-it-works)
- [Project layout](#project-layout)
- [Development & testing](#development--testing)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Known limitations](#known-limitations)

---

## Before you start (read this)

Three things will bite you if you skip them. Read them once, properly.

**1. This is a selfbot.** `DC_TOKEN` is *your own Discord account token*, used to read the source server through `discord.js-selfbot-v13`. Automating a user account **violates Discord's Terms of Service** and can get that account **permanently terminated**. That is inherent to the design, not a bug in this repo. Use a throwaway account you can afford to lose, and never share the token with anyone.

**2. Options 1–3 are destructive and irreversible.** They delete channels, roles and emoji in the **target** server. There is no undo and no recycle bin. The menu forces a second red confirmation, and `DRY_RUN=true` lets you rehearse safely — use it the first time.

**3. Direction matters.** `!clone <source> <target>` copies *from* source *into* target. Swapping the two ids can wipe the server you meant to copy from. Write both ids down before you type the command.

> First time? Do a `DRY_RUN=true` pass, then a real clone into an **empty test server** you don't care about. Do not make a production server your first target.

---

## What it clones

| | Copied | Not copied |
|---|---|---|
| **Categories** | Name, position, permission overwrites | — |
| **Text channels** | Name, topic, slowmode, NSFW, parent, overwrites | Pinned messages, messages, threads |
| **Announcement channels** | Type kept, same fields as text | Anything posted inside |
| **Voice channels** | Name, user limit, region, bitrate (clamped to target's boost level), parent, overwrites | Existing voice states |
| **Stage channels** | Name, bitrate, parent, overwrites | — |
| **Forum / media channels** | Name, topic, NSFW, default thread slowmode, tag **names** and moderation flags | Tag emojis, existing posts |
| **Roles** | Name, colour, hoist, mentionable, permissions, unicode emoji | Role **icons/gradients** (needs boost tier 2), role **assignments** (bots can't grant roles without knowing the members) |
| **Emoji** | Static and animated, within the target's slot budget | Stickers, soundboard sounds |
| **Server settings** | — | Name, icon, banner, splash, verification level, welcome screen, boosts |

Everything lists the **structure** of a server. None of the content people wrote is copied.

---

## Requirements

| Thing | Why |
|---|---|
| **Node.js 20+** (22 recommended) | `npm start` runs `index.js` |
| A **Discord account** you can run the bot from | That's the account `DC_TOKEN` belongs to |
| A **bot application** with *Administrator* in the target | The bot does all the writing |
| The user account **inside the source server** | It's the only thing that can read the source |
| Both **Message Content** and **Server Members** intents | Without them `!clone` is never received |

You do **not** need the bot in the source server, and you do **not** need it in every server — only the target.

---

## Part 1 — Install

### Step 1. Install Node.js

Check what you have:

```bash
node --version
```

If it prints `v20.x` or higher, you're fine. Otherwise install the LTS build from [nodejs.org](https://nodejs.org) (or `nvm install --lts`).

### Step 2. Get the code

```bash
git clone <this-repo-url> roxy-cloner-v2
cd roxy-cloner-v2
```

No git? Download the ZIP from GitHub and unzip it, then `cd` into the folder.

### Step 3. Install dependencies

```bash
npm install
```

You should see something like `added 91 packages`. Two harmless warnings appear: deprecations inside the selfbot library's dependencies, and npm noting that `discord.js-selfbot-v13` itself is no longer supported upstream.

### Step 4. Check it runs

```bash
npm start
```

Right now it will print the banner and then **exit with an error listing missing config** — that's expected and correct:

```
[ERROR] Configuration problem(s):
[ERROR]   • BOT_TOKEN is not set (needed to write to the target server).
[ERROR]   • DC_TOKEN is not set (needed to read the source server).
[ERROR]   • ALLOWED_ID is not set (who is allowed to run !clone).
```

If you see that, installation is done. Everything below fills those in.

---

## Part 2 — Create the bot

This is the account that **writes** into the target server.

### Step 5. Create the application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications).
2. **New Application** → give it a name (e.g. `Roxy Cloner`) → **Create**.
3. Copy the **Application ID** from the *General Information* page. You'll need it in Step 8.

### Step 6. Enable the required intents

1. Left sidebar → **Bot**.
2. Scroll to **Privileged Gateway Intents**.
3. Turn **on**:
   - **Message Content Intent** ← required, otherwise the bot cannot read `!clone`
   - **Server Members Intent** ← required, so member permission overwrites can be resolved
4. **Save Changes**.

> If the toggles are greyed out, your bot is in more than 100 servers and needs verification. This tool is meant for your own servers, so use a fresh application.

### Step 7. Copy the bot token

1. Still on the **Bot** page → **Reset Token** → **Yes, do it**.
2. Copy the token it shows **once** and paste it somewhere private for now.

It's a long string in three dot-separated parts (`<id>.<segment>.<signature>`), around 70 characters. If you lose it, reset again — Discord will never show it twice.

> ⚠️ Anyone with this token controls your bot. Never commit it, never paste it in Discord, never put it in a screenshot. `.env` is gitignored for this reason.

### Step 8. Invite the bot to the **target** server

Replace `YOUR_APP_ID` with the id from Step 5 and open this in a browser:

```
https://discord.com/oauth2/authorize?client_id=YOUR_APP_ID&scope=bot%20applications.commands&permissions=8
```

- `permissions=8` is **Administrator**. The cloner needs it to create/delete roles, channels and emoji, and to set permission overwrites.
- Pick the **target** server in the "Add to server" dropdown → **Continue** → **Authorise**.

Verify: open the target server's member list — your bot should now be listed (offline is fine, it will show online once it logs in).

---

## Part 3 — Get your account token

This is `DC_TOKEN`: the token of the **user account** that is already a member of the **source** server. It reads the source so the cloner knows what to build.

> 🔴 Reminder from the top of this README: using it this way breaks Discord's ToS and can get the account banned. Strongly prefer a throwaway account that has been invited to the source server.

### Step 9. Copy your own token

1. Open Discord in a **desktop browser** (not the desktop app) and log in as the account you're using.
2. Press <kbd>F12</kbd> (or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>I</kbd>) to open DevTools.
3. Go to the **Application** tab → **Local Storage** → `https://discord.com` → find the key named **`token`**.
4. Copy its value — the long string without surrounding quotes.

Alternate path with the **Network** tab: reload the page, click any request to `discord.com/api/...`, and read the `authorization` header of a request.

**Handling rules:**

- Store it only in `.env` on your own machine.
- Never send it to anyone, including "support" accounts — this project has no support channel.
- If it ever leaks, immediately change that account's password: **that invalidates the token**.
- Logging out of Discord does **not** invalidate it.

---

## Part 4 — Configure

### Step 10. Collect the three ids

You need two **server ids** and your **user id**.

1. Discord → **User Settings** (gear) → **Advanced** → enable **Developer Mode**.
2. **Source server id:** right-click the server icon → **Copy Server ID**.
3. **Target server id:** same thing on the other server.
4. **Your user id:** right-click your own name/avatar → **Copy User ID**.

Write all three down in the order you'll type them:

```
source:  111111111111111111   ← copy FROM this
target:  222222222222222222   ← copy INTO this
my id:   333333333333333333   ← who may run !clone
```

### Step 11. Create your `.env`

```bash
cp .env.example .env
```

Open `.env` in any text editor and fill it in:

```dotenv
# paste the values between the angle brackets, then delete the brackets
BOT_TOKEN=<bot token from Step 7>
DC_TOKEN=<your account token from Step 9>
ALLOWED_ID=333333333333333333

CLONE_DELAY_MS=750
DRY_RUN=true
```

Rules that matter:

- No spaces around `=`, no quotes, no trailing comments on the same line as a value.
- `ALLOWED_ID` accepts several ids separated by commas: `123,456,789`.
- `BOT_TOKEN` and `DC_TOKEN` must be **different** tokens — the app refuses to start if they're identical (a common copy-paste mistake).

### Step 12. Put the bot's role at the top of the **target** server

Discord forbids a bot from touching roles at or above its own highest role. Without this step, role cloning fails with `Missing Permissions`.

1. Target server → **Server Settings** → **Roles**.
2. Find your bot's role (named after the bot).
3. Drag it **above every other role** (just under the server owner's implicit position).
4. Nothing to save — Discord applies it instantly.

Also confirm the bot's role actually has **Administrator**: role → **Permissions** → *Administrator* toggled on.

### Step 13. Verify the config

```bash
npm start
```

A healthy start looks like this:

```
[INFO ] Allowed operator(s): 333333333333333333
[INFO ] Pace between API calls: 750ms · DRY RUN
[INFO ] Waiting for !clone — the bot(s) may take a few seconds to connect.
[INFO ] Bot ready as Roxy Cloner#1234 (2 guild(s)).
[INFO ] User client ready as yourname#0000 (14 guild(s)).
[INFO ] Ready.
```

If you instead see `Configuration problem(s)`, the messages name the exact variable that's wrong — fix and restart. Leave this process running.

---

## Part 5 — Run it

### Step 14. Run the command

In **any** channel the bot can read — the target server's `#general` is the obvious choice — type:

```
!clone 111111111111111111 222222222222222222
```

(source id first, target id second). Only ids in `ALLOWED_ID` can use it.

The bot runs these checks before showing the menu, and replies with the reason if one fails:

| Check | Failure message |
|---|---|
| Source ≠ target | "Source and target server ids are identical." |
| User account can see the source | "The user account cannot access the source server." |
| Bot is in the target | "The bot is not in the target server." |
| Bot has Administrator | "The bot needs **Administrator** in the target server." |
| Bot's role is top-most | "The bot's role is not at the top of the role list." |

### Step 15. Choose what to do

The menu has six toggles — grey means off, green with ✅ means on:

| # | Option | Destructive |
|---|---|---|
| 1 | Delete channels | ⚠️ |
| 2 | Delete roles | ⚠️ |
| 3 | Delete emojis | ⚠️ |
| 4 | Clone channels | |
| 5 | Clone roles | |
| 6 | Clone emojis | |

**First time: leave 1–3 off and turn on 4, 5, 6.** That copies into the target without deleting anything, which is the safest way to see whether the result looks right.

Click toggles → **Start cloning**. If any of 1–3 is on, you get a red screen listing exactly what will be deleted, with **Confirm wipe** / **Back** / **Cancel**. Nothing happens until you press Confirm.

The menu is scoped to you (nobody else can toggle or start it) and expires after 10 minutes.

### Step 16. Watch it run

You'll see a 3-second countdown, then live progress in the same channel:

```
Cloning **Source Server** → **Target Server** (6 phase(s)).
— Wipe channels —
✅ Deleted channel #old-chat
— Wipe roles —
✅ Deleted role OldRole
— Clone roles —
✅ Created role Admin
✅ Created role Member
— Clone channels —
✅ Created category General
✅ Created text channel #welcome
✅ Created voice channel Lounge
— Clone emojis —
Emoji slots: 50 static / 50 animated free (tier 0). Cloning 2 of 2.
✅ Created emoji :party:
```

Phase order is fixed: wipe channels → wipe roles → wipe emoji → clone roles → clone channels → clone emoji. Roles are created before channels because channel permission overwrites reference the new role ids.

The channel you ran the command in is **protected for the whole run** and deleted last, so progress doesn't stop halfway through a wipe.

### Step 17. Read the summary

When it finishes, a summary embed is posted **and** DM'd to you (the channel may no longer exist):

```
Cloning complete — Source Server → Target Server
Duration: 2m 14s

Roles: created 12, deleted 3
Channels: created 24, deleted 5
Emojis: created 8
```

Every failure is also listed with its reason, e.g.:

```
First 2 failure(s):
• [channels] Created text channel #staff-chat — Missing Permissions (code 50013)
• [emojis] Created emoji :rare: — Maximum number of emojis reached (code 30008)
```

A DM also arrives even if you closed the channel or the process is about to be stopped.

---

## After the clone

A clone is structurally faithful but deliberately incomplete. Do these by hand:

1. **Re-invite your bots.** Bots are not copied and their roles can't be auto-assigned.
2. **Re-order roles if needed.** Role order is preserved by creating highest-first, but anything created *during* the run can shift it. Fix by dragging in **Server Settings → Roles**.
3. **Assign roles to members.** The cloner can't know who should have what.
4. **Re-create integrations:** webhooks, Twitch/YouTube follows, auto-mod rules, audit-log settings.
5. **Re-upload anything binary:** server icon, banner, role icons, stickers, soundboard.
6. **Check channel permissions** on a couple of private channels — member-specific overwrites are only kept when that member exists in the target.
7. **Delete the leftover log channel if you didn't use option 1** — it's protected during the run, so it survives clone-only runs. Rename or delete it manually.

---

## Reference: commands, options, env vars

### Commands

| Command | What it does |
|---|---|
| `!clone <source_id> <target_id>` | Opens the clone menu for those two servers |
| `!help` | Shows usage and requirement summary in Discord |

### Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `BOT_TOKEN` | ✅ | – | Bot token from the Developer Portal; **writes** the target |
| `DC_TOKEN` | ✅ | – | Your own account token; **reads** the source |
| `ALLOWED_ID` | ✅ | – | One or more user ids allowed to run `!clone`, comma separated |
| `CLONE_DELAY_MS` | – | `750` | Pause between API calls, clamped to `0–10000`. Lower is faster and closer to rate limits. |
| `DRY_RUN` | – | `false` | `true` = simulate and report, change nothing |
| `MAX_EMOJIS_PER_RUN` | – | unlimited | Hard cap on emoji cloned per run |
| `LOG_LEVEL` | – | `info` | `debug` \| `info` \| `warn` \| `error` \| `silent` |

### npm scripts

| Script | What it does |
|---|---|
| `npm start` | Run the cloner |
| `npm test` | 86 tests — no network or tokens needed |
| `npm run check` | Syntax-check every file |

---

## Running from GitHub Actions

`.github/workflows/cloner.yml` is manual-trigger only and gives you a 90-minute runner, so you don't need to keep a laptop awake. It runs a **Verify** job (`npm run check`, `npm test`) before the clone job, and has a `dry_run` input.

1. Repository → **Settings** → **Secrets and variables** → **Actions**.
2. Add secrets: `BOT_TOKEN`, `DC_TOKEN`, `ALLOWED_ID`.
3. Optional variables: `CLONE_DELAY_MS`, `LOG_LEVEL`.
4. **Actions** tab → **Roxy Cloner V2** → **Run workflow** (pick `dry_run: true` the first time).

> ⚠️ Discord frequently blocks or challenges logins from datacenter IPs, so Actions may fail at login even when everything is configured correctly. If it does, run locally.

---

## How it works

Two clients run side by side, because no single token can both read a server it isn't in and write to another:

```
DC_TOKEN  (discord.js-selfbot-v13) ──reads──▶  source server
BOT_TOKEN (discord.js)            ──writes─▶  target server
```

1. `!clone` is validated: allowlist → server ids → source reachable → bot in target → Administrator → bot role on top.
2. The menu collects options; destructive selections require a second confirmation.
3. Phases run in order inside `src/cloner/`:
   - **wipe** channels (children first, categories last), roles (highest first), emoji
   - **clone** roles (highest position first), then channels (categories first), then emoji
4. Every mutating call goes through `CloneRunner.mutate()`, which handles retries (`retry_after` aware), pacing (`CLONE_DELAY_MS`), dry-run short-circuiting, failure counting and log fan-out in one place.
5. Roles are created **highest-first** because Discord inserts new roles at the *bottom* of the list — that ordering makes the final stack match the source. (There's a test documenting this so it doesn't get "fixed" incorrectly.)
6. Role ids and category ids are mapped source→target so permission overwrites and channel parents survive the copy.
7. Progress is batched into Discord messages (≈2.5s flush) instead of one message per object; if the log channel dies, the notifier fails over to your DMs.
8. After 5 consecutive permission errors a phase aborts instead of hammering the API.

---

## Project layout

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

---

## Development & testing

```bash
npm test          # 86 tests, no network access, no tokens
npm run check     # syntax check every file
```

Coverage spans the pure helpers (config parsing, error classification, retry/backoff, channel payloads, overwrite remapping, role/emoji planning, reporting, log chunking) **plus** `test/cloneRun.test.js`, which drives the real pipeline against fake guild objects — full delete → clone → report runs, dry-run, clone-only and role-capacity paths are all exercised without touching Discord.

Handy during development:

```bash
DRY_RUN=true LOG_LEVEL=debug npm start   # verbose, no mutations
```

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Bot logs in but `!clone` does nothing | Message Content intent is off, or your id isn't in `ALLOWED_ID` (check the log line `Allowed operator(s)`) |
| "The user account cannot access the source server" | `DC_TOKEN` account isn't in the source, or the token is stale → log in again and re-copy it |
| "The bot needs **Administrator**" | Grant it on the bot's **role**, not a channel override |
| "The bot's role is not at the top of the role list" | Drag the bot role above every other role (Step 12) |
| `Invalid Bot Token` / login hang | Token copy-pasted with quotes/spaces, or reset since you copied it |
| `Missing Permissions (50013)` on roles | Bot role isn't top-most, or you're cloning roles above it in the target |
| Roles cloned in the wrong order | Something created roles mid-run; re-run only option 5 after clearing them |
| Emoji stop early with a rate-limit warning | Discord caps emoji **uploads per day**; retry the next day or set `MAX_EMOJIS_PER_RUN` |
| Emoji stop with "maximum emoji slots reached" | Target boost tier slots are full — boost the server or clone fewer |
| Phase stops: "consecutive permission errors" | The bot lost access mid-run (role moved/deleted); re-check Step 12 |
| `Cannot find module 'discord.js'` | `npm install` hasn't run in this folder |
| `npm start` exits instantly with config errors | Every listed variable is missing/blank in `.env` (Step 11) |
| Works locally, fails on Actions | Datacenter IP blocked by Discord — run locally |
| Duplicate log messages | Both clients received the same command; the dedupe set handles this automatically — if you still see it, update to the latest code |

---

## FAQ

**Will it work if the bot isn't in the source server?**
Yes — that's the whole point. The **user account** reads the source; the bot only needs the target.

**Can I clone into the same server?**
No. Source and target must differ; the command rejects identical ids.

**Does it copy messages?**
No. Structure only — channels, roles, emoji.

**Does it copy stickers / soundboard / server icon?**
Not yet. Those need binary uploads and are listed under limitations.

**How long does it take?**
`CLONE_DELAY_MS` × number of objects, roughly. A 30-channel server with ~15 roles is about a minute; a 500-object server can take 10+ minutes. The Actions job allows 90 minutes.

**Can I stop it midway?**
Press <kbd>Ctrl</kbd>+<kbd>C</kbd>. Deletions and creations already made are permanent — the cloner is not transactional. Re-running is safe: it re-creates what's missing.

**Is anything logged publicly?**
Progress goes to the channel you ran the command in, plus a DM summary. The bot never logs tokens.

**Can other people use it?**
Only ids listed in `ALLOWED_ID`, and only they can control the menu.

---

## Known limitations

- Guild-level settings (name, icon, banner, verification level, welcome screen) are **not** copied.
- Messages, threads, pins and member role assignments are **not** copied.
- Role icons and gradients are **not** copied (boost tier 2 + binary icon data required).
- Forum tag **emojis** are dropped; tag names and moderation flags are kept.
- Member-specific permission overwrites are kept only when that user is present in the target.
- The run is **not transactional**: interrupting it leaves a partial clone.
- The selfbot dependency `discord.js-selfbot-v13` is deprecated upstream — it works today, but it is a dead end long-term.

---

## License

ISC
