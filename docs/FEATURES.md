# ChatGPT vs Claude vs Sabeel: feature checklist

Checked against the official release notes on **8 November 2026**. Features keep changing, so re-check with the update tracker (see `docs/UPDATES.md`).

**Sabeel status key**

- ✅ Works in Sabeel v0.1 (built)
- 🔜 Planned, possible with the API (build next)
- ⚠️ Partly possible with the API
- ❌ App-only feature: the companies don't offer it through the API, so Sabeel can't copy it directly

---

## 1. ChatGPT app: what it can do

| # | Feature | What it means | Sabeel |
|---|---|---|---|
| 1 | Latest GPT models (GPT-6 with "Intelligent UI", GPT-5.x Instant) | Main chat models | ✅ model list loads automatically from your key |
| 2 | Image generation and editing (ChatGPT Images) | Make images from text, edit an uploaded photo | ✅ text-to-image and edit with a reference photo |
| 3 | Web search in answers | Searches the web while answering | ✅ "Web" switch |
| 4 | File, image and PDF uploads | Ask questions about your files | ✅ images, PDFs, text files. Word/Excel: 🔜 |
| 5 | Audio uploads | Transcribe and summarise recordings | 🔜 via OpenAI transcription API |
| 6 | Camera scan to PDF | Scan several pages into one PDF | ⚠️ phone camera photo works now, multi-page PDF 🔜 |
| 7 | Voice mode (GPT-Live-1) and dictation | Talk to ChatGPT, speak instead of typing | ⚠️ voice typing ✅, full voice conversation 🔜 (Realtime API) |
| 8 | Projects (with project memory, shared projects) | Folders of chats with files and instructions | 🔜 Phase 2 |
| 9 | Memory | Remembers facts about you | 🔜 (a local "About me" memory file) |
| 10 | Custom instructions | Standing instructions for every chat | ✅ |
| 11 | Temporary chat | Chats that aren't saved | 🔜 easy to add |
| 12 | Search across chats, pinned chats, Library | Find old chats and files | ✅ search + Library. Pinning 🔜 |
| 13 | Plugins and connected apps (Google Drive, iCloud Mail and Calendar, Meetings) | Connect your other apps | ⚠️ any remote MCP server ✅, ready-made app logins ❌ |
| 14 | ChatGPT Work (agent for long tasks, works on signed-in websites) | Does multi-step tasks for you | ❌ app-only |
| 15 | Codex (coding agent, code review, remote access from phone) | Writes and reviews code in a repo | ❌ separate product |
| 16 | ChatGPT Sites | Turn an idea into a hosted website or small app | ❌ app-only (HTML preview ✅) |
| 17 | Scheduled tasks (can react to app updates) | Runs tasks on a schedule | 🔜 needs a small server |
| 18 | ChatGPT Space | Organise work in one place | 🔜 similar to Projects |
| 19 | Custom GPTs | Your own assistants with instructions | 🔜 "Personas" |
| 20 | Chrome extension / sidebar, desktop app, mobile apps | Use it everywhere | ✅ installable app on laptop and phone + Chrome side panel |
| 21 | ChatGPT on WhatsApp | Chat through WhatsApp | ❌ not planned |
| 22 | Life features (job search, restaurant bookings, finance dashboard) | Special built-in tools | ❌ app-only |

## 2. Claude app: what it can do

| # | Feature | What it means | Sabeel |
|---|---|---|---|
| 1 | Latest Claude models (Opus 5.5, Sonnet 5.5, Haiku 5.5, Fable 5.1) | Main chat models | ✅ model list loads automatically from your key |
| 2 | Connectors (MCP) | Connect websites and apps as tools | ✅ remote MCP servers by URL + token. One-click OAuth login 🔜. Local (on-PC) servers ❌ |
| 3 | Artifacts | Code, pages and documents in a side panel with live preview | ⚠️ HTML/SVG live preview ✅, full side panel 🔜 |
| 4 | Designs, decks and docs in any conversation | Makes slides, documents, designs | ❌ app-only (can ask for HTML and preview it) |
| 5 | Skills | Reusable instruction packs (Excel, PowerPoint, PDF and your own) | ⚠️ possible through the Skills API + code execution, 🔜 Phase 4 |
| 6 | Plugins | Bundles of skills, connectors and commands | ❌ app-only for now |
| 7 | Cowork in every conversation (agent that works with files, computer use) | Does long tasks on your computer and files | ❌ app-only |
| 8 | Projects | Folders of chats with files and instructions | 🔜 Phase 2 |
| 9 | Memory | Remembers facts about you across chats | 🔜 |
| 10 | Web search and Research | Searches the web, writes research reports | ✅ web search. Long research reports 🔜 |
| 11 | File uploads (images, PDFs, documents) | Ask about your files | ✅ images, PDFs, text. Word/Excel 🔜 |
| 12 | Scheduled tasks | Runs tasks on a schedule | 🔜 needs a small server |
| 13 | Claude in Chrome | Claude acts in your browser | ⚠️ Sabeel opens in the Chrome side panel ✅, but can't click websites ❌ |
| 14 | Desktop apps (Windows, Mac), mobile apps, interactive charts on mobile | Use it everywhere | ✅ installable app on laptop and phone |
| 15 | Voice mode and dictation | Talk to Claude | ⚠️ voice typing ✅ |
| 16 | Claude Code | Coding agent in terminal and apps | ❌ separate product |
| 17 | Research previews (for example Claude Duet) | New experiments for paid plans | ❌ app-only |

## 3. Extra things Sabeel does that neither app does

- ✅ Claude and GPT models in **one chat**, switch any time, even mid-conversation
- ✅ Shows **tokens used** on every answer and a monthly usage table, so you can see your spend
- ✅ **Pay only for what you use** with your own API keys, no monthly subscription
- ✅ One **Library** for every generated image and uploaded file
- ✅ **Backup file** to move everything between laptop and phone
- 🔜 **Compare mode**: send one question to two models side by side (like AI Fiesta)

## 4. Build roadmap

| Phase | What gets built | Status |
|---|---|---|
| 1 | Chat with Claude + GPT, model picker, streaming, history, image generation and editing, web search, MCP connectors, Library, backup, voice typing, installable app, Chrome side panel | ✅ done (v0.1) |
| 2 | Projects (folders with files and instructions), memory, temporary chat, pinning, Word/Excel upload | 🔜 next |
| 3 | Sync between laptop and phone automatically (small backend, e.g. Supabase free tier) | 🔜 |
| 4 | Compare mode, read-aloud, audio transcription, Skills, artifacts side panel | 🔜 |
| 5 | Play Store app (Android) and Windows .exe installer | 🔜 only if needed, the installable web app already covers both |

## Sources

- [ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes)
- [Claude apps release notes](https://support.claude.com/en/articles/12138966-release-notes)
- [Claude Platform (API) release notes](https://platform.claude.com/docs/en/release-notes/overview)
- [OpenAI API changelog](https://developers.openai.com/api/docs/changelog)
- [Claude MCP connector docs](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)
- [OpenAI remote MCP docs](https://developers.openai.com/api/docs/guides/tools-remote-mcp)
