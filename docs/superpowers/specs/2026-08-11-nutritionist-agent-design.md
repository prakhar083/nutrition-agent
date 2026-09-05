# Personal Nutritionist Agent — Design

## Goal

A personal nutritionist agent that takes calorie/macro/micro targets (text or
screenshot), generates a daily meal plan matching those targets and the
user's preferences, checks ingredient availability on Zepto, writes Hinglish
cooking instructions, and delivers the day's plan to the user via Telegram
every morning. The user manually forwards the plan to their cook's WhatsApp
group — there is no WhatsApp integration in the system.

## Scope

- Single user, India-first (regional Indian cuisine, Zepto is India-only).
- Runs locally for now (v1). Deployment to an always-on host is a later,
  separate step — not part of this build.
- No WhatsApp automation of any kind (avoids ToS/ban risk of unofficial
  WhatsApp automation entirely).

## Architecture

Node.js/TypeScript, single long-running local process.

1. **Telegram Bot** — the only user-facing surface. Handles onboarding,
   receiving updated targets (text or screenshot), receiving preference
   changes, receiving curated YouTube links, and delivering the daily plan.
2. **Ingredient Nutrition DB** — local static dataset seeded from USDA
   FoodData Central + IFCT 2017 (Indian foods), keyed by ingredient with
   per-100g calories/macros/micros. Source of truth for all nutrition math.
3. **Meal Plan Generator** — Claude-powered. Given today's targets,
   preferences (including available cooking mediums and any extracted
   preference notes from an existing meal plan), and recent meal history,
   composes dishes bottom-up from ingredients (dish = list of
   `{ingredient, grams}`), computes totals from the Ingredient DB, and
   iterates until the day's plan hits macro/micro targets within tolerance.
4. **Variety Tracker** — stores plan history; excludes dishes served within
   a rolling window (default 14 days, configurable) when generating new
   plans. If targets can't be hit within the window, oldest exclusions are
   relaxed first before reporting infeasibility to the user.
5. **Zepto Availability Checker** — for each ingredient in a draft plan,
   calls the Zepto MCP for availability. Unavailable items are
   auto-substituted with a nutritionally-similar available ingredient, and
   the affected dish's totals are recomputed.
6. **Recipe Writer** — produces Hinglish cooking instructions per dish.
7. **Video Library** — a `{dish_name -> YouTube URL}` store, populated only
   when the user sends a link via Telegram tagged to a dish. Reused
   automatically in future plans for that dish. No automatic YouTube
   search — links are user-curated only.
8. **Scheduler** — in-process cron (`node-cron`) that fires once daily at a
   fixed morning time, runs the full pipeline, and sends the result to the
   user on Telegram.
9. **Storage** — SQLite on local disk: user profile & preferences, active
   targets, ingredient DB, plan history, video library.

### Daily pipeline

Scheduler fires -> Meal Plan Generator drafts dishes against current targets,
filtered by Variety Tracker -> Zepto Checker validates/substitutes
ingredients -> Recipe Writer adds Hinglish instructions + any known video
link -> formatted message sent to the user via Telegram.

## Onboarding (via Telegram, one-time, editable later)

Bot asks, one at a time: dietary preference (veg/non-veg/eggetarian/vegan),
allergies/dislikes, regional cuisine preference (North/South/East/West
Indian), available cooking mediums (e.g. gas stove, convection microwave,
air fryer, OTG, induction), meals and snacks per day (e.g. 3 meals + 1
snack), and initial calorie/macro/micro targets (text or screenshot — sent
directly to Claude's vision, no separate OCR). Stored as the user profile
in SQLite.

Per-dish portion sizes are not asked for directly — they're an output, not
an input. Total daily calorie/macro targets are split across the chosen
number of meals/snacks, and exact ingredient grams per dish are computed
from that split via the local nutrition DB (same math as the rest of the
plan), rather than being constrained by a separately-stated gram figure.

Available cooking mediums constrain the Meal Plan Generator and Recipe
Writer: dishes are only proposed if they're achievable with at least one of
the user's available mediums, and the Hinglish instructions are written for
that specific medium (e.g. air-fryer timing/temp vs. stovetop steps for the
same dish). Editable later the same way as other preferences.

Onboarding also has one optional step: if the user has an existing meal plan
(e.g. from a previous dietician), they can send it (text or screenshot,
parsed the same way as targets). The agent extracts *preference signals*
from it — dish style, favorite ingredients/cuisines, typical macro split —
as free-form notes, not a literal list of dishes to repeat. These notes are
passed to the Meal Plan Generator as soft guidance alongside diet
type/region/allergies; they bias new dish choices toward the user's known
taste without pinning the plan to specific old dishes. If the user has no
existing plan, they type "skip" and this step is a no-op.

## Updating targets later

The user can send new targets anytime (text or screenshot) via the same
Telegram chat. The bot parses and overwrites the active targets, effective
from the next scheduled plan. Same intake handler is used for onboarding and
updates — there is no separate "update" flow.

## Error handling

- **Zepto MCP unavailable/errors:** generate the plan without availability
  filtering; flag in the Telegram message that stock wasn't checked today.
- **Vision parse of a targets screenshot fails/ambiguous:** bot asks the
  user to clarify or re-send rather than guessing.
- **Plan generator can't hit targets within tolerance:** relax the variety
  window (oldest exclusions expire first); if still infeasible, report to
  the user instead of shipping an off-target plan.
- **Scheduler fires but generation fails:** retry once; if it still fails,
  send the user a Telegram alert instead of nothing.

## Testing strategy

- Unit tests for ingredient-math (nutrition rollup from
  ingredients+grams -> totals) — pure and correctness-critical.
- Unit tests for variety-window filtering logic.
- Integration test for the full pipeline with a mocked Zepto MCP and mocked
  Claude calls (fixed fixtures) verifying end-to-end message format.
- Manual verification of the Telegram onboarding conversation and a real
  Zepto MCP call against a couple of known ingredients.

## Deployment

Out of scope for this build. v1 runs locally (`pm2`/plain `node` process on
the user's machine). Moving to an always-on host (small VPS) is a follow-up
task once the local version is validated.
