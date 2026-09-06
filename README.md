# Butler — a personal nutritionist agent on Telegram

Butler plans your food for the day and messages it to you every morning on Telegram.

You tell it your diet, allergies, cuisine, cooking equipment and how many people eat at
home. You send it your calorie/macro targets — as text or just a screenshot of your
dietician's plan. Every morning it composes that day's meals **bottom-up from real
per-100g nutrition data**, checks the arithmetic itself, retries until the day's totals
land within 10% of every target (calories, protein, carbs, fat *and* fiber), writes
Hinglish cooking instructions for the exact appliance you own, and sends you:

1. one message per meal/snack (dish, steps, and your saved YouTube video if you have one),
2. a consolidated shopping list scaled to your household size,
3. a totals-vs-targets summary.

Then you forward it to whoever cooks. There is deliberately no WhatsApp automation.

```
🍛 Lunch: Rajma Chawal
1. Rajma ko pressure cooker mein 4 whistle...
...
🎥 Video: https://youtu.be/...

🛒 Shopping list for today (serves 3):
• onion: 240g
• rajma: 300g
...

📊 Nutrition Summary (per person):
🔥 Calories: 2043 kcal (target 2000 kcal)
💪 Protein: 148.2g (target 150g)
...
```

---

## How it works

```
node-cron (daily)
   └─> Meal Plan Generator ── Claude, given exact per-100g values for 102 ingredients
        │                     retries up to 5x until totals are within 10% of targets
        ├─> Variety Tracker ── excludes dishes served in the last 14 days
        ├─> Zepto Checker ──── stock check + nutritional substitution (see caveat below)
        ├─> Recipe Writer ──── Hinglish steps for one of *your* cooking mediums
        └─> Telegram ───────── per-meal messages + shopping list + summary
```

- **Stack:** Node.js + TypeScript, [Telegraf](https://telegraf.js.org/) for Telegram,
  `better-sqlite3` for storage, `node-cron` for scheduling.
- **Nutrition source of truth** is `data/ingredients.seed.json` — 102 ingredients with
  per-100g calories/protein/carbs/fat/fiber, sourced from USDA FoodData Central and
  IFCT 2017 (see `data/ingredients.sources.md`). The LLM is told to use only these
  numbers, and the totals are recomputed in code afterwards, so a hallucinated
  nutrition value can't silently reach your plan.
- **State** lives in one SQLite file (`data/butler.db`): profile, active targets,
  ingredient DB, plan history, video library.

### LLM calls: no API key

Butler does **not** use `ANTHROPIC_API_KEY`. Every model call shells out to the `claude`
CLI in headless mode (`src/anthropic/client.ts`), so it runs on your logged-in Claude
subscription. That means the `claude` CLI must be installed **and authenticated on the
same machine that runs Butler** — including on your server. See the EC2 section.

### Known caveat: Zepto

The Zepto MCP availability check is **not live**. Zepto's OAuth server was down during
development, so the real tool name was never verified, and
`checkAvailabilityViaZepto()` throws on purpose rather than faking an integration. The
pipeline treats this as an expected fallback: it plans without stock filtering and adds
a ⚠️ line to your shopping list telling you to confirm availability yourself. Everything
else works. If you wire it up, the only thing you need to implement is a
`(ingredientName: string) => Promise<boolean>` in `src/zepto/availabilityChecker.ts`.

---

## Prerequisites

| | |
|---|---|
| Node.js | 20+ (developed on 22) |
| `claude` CLI | installed and logged in ([install](https://claude.com/claude-code)) |
| A Telegram bot | token from [@BotFather](https://t.me/BotFather) |
| Your Telegram chat ID | see below |

**Getting the bot token:** message `@BotFather` on Telegram → `/newbot` → follow the
prompts → copy the token it gives you.

**Getting your chat ID:** send any message to your new bot, then open
`https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser and read
`result[0].message.chat.id`. (Or message `@userinfobot`.)

---

## Local setup

```bash
git clone <your-fork-url> butler
cd butler
npm install
cp .env.example .env
```

Fill in `.env`:

```ini
TELEGRAM_BOT_TOKEN=123456:ABC...      # required
TELEGRAM_CHAT_ID=987654321            # required — where the daily plan is sent
ZEPTO_MCP_URL=https://mcp.zepto.co.in/mcp
DAILY_PLAN_CRON=0 7 * * *             # 7am in the *process's* timezone
VARIETY_WINDOW_DAYS=14                # don't repeat a dish within N days
DB_PATH=./data/butler.db
```

Make sure the CLI Butler depends on is authenticated:

```bash
claude          # log in once if you haven't; ctrl-c out after
claude -p "say hi"   # should print a response, not an auth error
```

Run it:

```bash
npm run dev     # tsx, no build step — good for local
```

The database schema is created and the 102 ingredients are seeded automatically on
first boot. Then, in Telegram:

1. Send `/start` and answer the onboarding questions (diet, allergies, region, cooking
   mediums, meals/day, snacks/day, household size). The last step optionally accepts
   your existing meal plan as text or a screenshot — Butler extracts soft style
   preferences from it, not dishes to copy.
2. Send your daily targets, e.g. `2000 kcal, 150g protein, 200g carbs, 60g fat` — or
   just send a **screenshot** of them. Butler confirms what it parsed. New targets take
   effect from the next plan.
3. Optionally send `dal_rice https://youtu.be/xyz` to attach a video to a dish. It gets
   reused every time that dish comes up.

### Useful commands

```bash
npm run dev       # run the bot (watchless, tsx)
npm run build     # tsc -> dist/
npm start         # run the compiled build
npm test          # vitest
npm run daily     # run today's pipeline once, print + send it (great for testing)
npm run recipe -- "Paneer Bhurji" "paneer:150,onion:80,tomato:70" --meal-type Dinner
```

`npm run daily` is the fastest feedback loop — it skips the cron wait entirely.

---

## Deploying on EC2 (or any always-on Linux box)

Butler is a single long-running process with a local SQLite file. A `t3.micro` (or
even `t4g.micro`) is plenty. No inbound ports are needed — Telegram is polled via
long-polling, not webhooks — so the security group only needs SSH from your IP.

### 1. Launch and connect

Ubuntu 24.04 LTS, 8 GB disk, your key pair.

```bash
ssh -i your-key.pem ubuntu@<ec2-public-ip>
```

### 2. Install Node and build tools

`better-sqlite3` is a native module; if no prebuilt binary matches your platform it
compiles from source, so install `build-essential` up front.

```bash
sudo apt update && sudo apt install -y build-essential python3 git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

### 3. Install and authenticate the `claude` CLI

This is the step people miss. Butler's model calls run through the CLI, so the CLI must
be logged in **as the same Linux user that will run Butler**.

```bash
npm install -g @anthropic-ai/claude-code
claude       # follow the login flow; on a headless box it prints a URL —
             # open it on your laptop, then paste the code back
claude -p "say hi"   # must succeed before Butler will work
```

Auth is stored in `~/.claude` for that user, so don't run the login as `ubuntu` and the
service as `root` (or vice versa).

### 4. Set the timezone

`DAILY_PLAN_CRON` is interpreted in the server's local timezone, and EC2 defaults to
UTC. If you want 7am IST, either set the box's timezone:

```bash
sudo timedatectl set-timezone Asia/Kolkata
```

…or leave it on UTC and write the cron in UTC (`30 1 * * *` = 7:00 IST).

### 5. Deploy the app

```bash
git clone <your-fork-url> ~/butler
cd ~/butler
npm ci
cp .env.example .env
nano .env          # fill in token + chat id, as in the local setup
npm run build
npm start          # sanity check, then ctrl-c
```

### 6. Run it under systemd

```bash
sudo tee /etc/systemd/system/butler.service > /dev/null <<'UNIT'
[Unit]
Description=Butler nutritionist agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/butler
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now butler
systemctl status butler
journalctl -u butler -f      # live logs
```

`WorkingDirectory` matters: `DB_PATH`, the ingredient seed file, and the Zepto token
cache are all resolved relative to it.

### 7. Updating

```bash
cd ~/butler && git pull && npm ci && npm run build && sudo systemctl restart butler
```

### 8. Back up your data

Everything that isn't recoverable from git lives in one file. Back it up with SQLite's
own backup command (safe while the process is running, unlike `cp` with WAL enabled):

```bash
sqlite3 ~/butler/data/butler.db ".backup '/home/ubuntu/butler-$(date +%F).db'"
```

### Running it elsewhere

Nothing here is EC2-specific — the same systemd unit works on a Hetzner/DigitalOcean
VPS, a Raspberry Pi, or a Lightsail box. Two things to know before you reach for
containers or serverless: the `claude` CLI's auth lives in `~/.claude` (so a container
needs that mounted or re-authenticated), and SQLite wants a real persistent disk, not
an ephemeral filesystem.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `Missing required env var: TELEGRAM_BOT_TOKEN` | `.env` missing or not in the working directory |
| `claude CLI exited with code 1` | CLI not installed, not on `PATH` for the service user, or not logged in |
| `claude CLI returned non-JSON output` | Usually the same auth problem surfacing differently |
| Nothing arrives at 7am | Server timezone vs. `DAILY_PLAN_CRON` — check `timedatectl` |
| `Cannot run pipeline before onboarding and targets are set` | Send `/start`, then your targets |
| `⚠️ Zepto stock wasn't checked today` | Expected — see the Zepto caveat above |
| Bot replies twice / handlers fight | Handler order in `src/index.ts` is deliberate; see the comment there |

## Project layout

```
src/
  index.ts                 entrypoint: seeds DB, registers handlers, starts cron
  config.ts                env parsing
  anthropic/client.ts      the ONLY place that shells out to the claude CLI
  telegram/                bot, onboarding, targets intake, video links, formatting
  planning/                meal plan generator (with retry loop), recipe writer
  nutrition/               per-100g math: totals, scaling
  variety/                 recent-dish exclusion
  zepto/                   MCP client + availability/substitution (see caveat)
  db/                      SQLite client, schema, repositories
  pipeline/                the daily pipeline
  scheduler/               node-cron job
scripts/                   trigger-daily, trigger-recipe (manual runs)
data/                      ingredient seed + sources, SQLite file (gitignored)
docs/                      design spec and build plan
```

## Notes if you're forking this

- It's **single-user by design** — `TELEGRAM_CHAT_ID` is one chat, and `user_profile`
  has a `CHECK (id = 1)`. Multi-user means keying profile/targets/history by chat ID.
- The ingredient DB is India-first. Add rows to `data/ingredients.seed.json` and delete
  `data/butler.db` (or insert directly) to extend it — the planner can only use
  ingredients that exist there.
- `data/butler.db` and `.env` are gitignored. Keep it that way.
