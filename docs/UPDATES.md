# How you find out about new ChatGPT and Claude features

You don't need to check websites yourself. Sabeel has a small **update tracker** that does it for you.

## How it works

1. Every **Monday at 9:30 AM (India time)**, GitHub runs `tools/check_updates.py` for free.
2. It reads these four official pages:
   - ChatGPT release notes (new ChatGPT app features)
   - Claude apps release notes (new Claude app features)
   - Claude Platform release notes (new things in the Claude **API**)
   - OpenAI API changelog (new things in the OpenAI **API**)
3. It compares them with last week's copy (saved in `updates/snapshots/`).
4. If anything is new, it writes the new lines to `updates/LATEST.md` and opens a **GitHub issue** called "New AI updates". GitHub emails you about the issue, so you'll know the same day.

You can also run it any time: open the repo on GitHub, go to **Actions**, pick **Check AI updates**, then **Run workflow**.

## What to do when an update comes in

Ask one question for each new feature: **is it in the API?**

- **App update only** (ChatGPT or Claude app release notes) and **nothing matching in the API changelog** → the companies haven't opened it to developers yet. Note it in `docs/FEATURES.md` with ❌ and wait.
- **Shows up in an API changelog** (new model, new tool, new image model) → Sabeel can get it. Mark it 🔜 in `docs/FEATURES.md`.
- **New model** → nothing to build. Open Sabeel, go to **Settings**, press **Save keys and load models**. New models appear in the list by themselves.

## Ready prompt to add a new feature

Paste this into Claude (or any AI coding tool) with the Sabeel repo:

```
This is my Sabeel app repo (plain HTML/CSS/JS, no build step).
Files: js/providers.js (Anthropic + OpenAI API calls), js/app.js (UI and storage),
index.html, css/app.css, docs/FEATURES.md.

New feature to add: [paste the release-note lines from updates/LATEST.md here]

1. First tell me in simple Roman English whether this is possible through the API,
   and what it will cost per use.
2. If yes, add it with the smallest change that fits the current code style.
3. Update docs/FEATURES.md (mark it ✅) and bump the version in js/app.js and sw.js.
4. Tell me how to test it.
```

## Running the tracker on your own computer

```
python3 tools/check_updates.py
```

The first run only saves a starting copy. From the second run on, it reports what changed.
