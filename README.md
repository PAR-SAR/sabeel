# Sabeel

Sabeel (سبيل, "the path") is one app for **Claude** and **ChatGPT** models. You use your own API keys and pay only for what you use. No monthly subscription.

It runs on your **laptop** and your **Android phone** from the same code, and it can also open in **Chrome's side panel**.

## What works in version 0.1

- Chat with every Claude model and every ChatGPT (OpenAI) model your keys can use. The list loads automatically, so new models show up without updating the app.
- Switch models any time, even in the middle of a chat.
- **Image mode**: make images with OpenAI's image models (GPT Image), choose size and quality, attach a photo to edit it.
- **Web** switch: the model searches the web while answering.
- **Connectors** switch: use your own remote MCP servers (like Claude connectors).
- Attach images, PDFs and text files. Paste or drag files in.
- Voice typing (English, Hindi, Urdu, Telugu, Arabic).
- **Library**: every generated image and every uploaded file, saved in one place.
- Chat history with search, rename, delete, and download as Markdown.
- Tokens used on every answer, plus a monthly usage table.
- Backup file to move everything between laptop and phone.
- HTML/SVG code in answers gets a **Preview** button.
- Light and dark theme. Works offline (except the AI replies, which need internet).

The full ChatGPT vs Claude vs Sabeel list is in [`docs/FEATURES.md`](docs/FEATURES.md).

## Setup (about 20 minutes, one time)

### 1. Get your API keys

- **Claude**: go to https://platform.claude.com, add a small credit (for example $5), then create a key under **API keys**. Also set a **monthly spend limit** in Billing so the bill can never surprise you.
- **OpenAI**: go to https://platform.openai.com, add a small credit, then create a key under **API keys**. Set a usage limit too.

You can start with only one of the two.

### 2. Put Sabeel online (free)

The app has to be on an `https://` address to install on a phone. Two free options:

**Option A: GitHub Pages (recommended)**
1. Create a new repository on GitHub called `sabeel` and upload all these files.
2. In the repo, open **Settings > Pages**, set **Source** to "Deploy from a branch", branch `main`, folder `/ (root)`, and save.
3. After a minute your app is live at `https://<your-username>.github.io/sabeel/`.

This also turns on the weekly **update tracker** (see below).

**Option B: your own hosting (for example Hostinger)**
Make a subdomain like `sabeel.yourdomain.com`, turn on SSL, and upload all the files to it with File Manager.

### 3. Install on your laptop (Windows)

Open your Sabeel link in **Chrome** or **Edge**. Click the install icon at the right end of the address bar (or go to **Settings > Install Sabeel** inside the app). Sabeel now opens like a normal app from the Start menu.

### 4. Install on your Android phone

Open the same link in **Chrome** on the phone. Tap the **⋮** menu, then **Install app** (or **Add to Home screen**). The Sabeel icon appears on your home screen.

### 5. Add your keys

Open Sabeel, go to **Settings**, paste your keys, and press **Save keys and load models**. Do this on each device (or use a backup file with keys included).

### 6. (Optional) Chrome side panel extension

1. Run `python3 tools/build_extension.py` (or use the ready `sabeel-extension.zip` and unzip it).
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose the `sabeel-extension` folder.
3. Click the Sabeel icon in Chrome's toolbar to open it beside any website.

The extension keeps its own separate chat history. Use backup and import to copy chats between them.

## Moving chats between laptop and phone

Version 0.1 saves everything **on each device separately**. To move your chats and images: **Settings > Download backup** on one device, then **Settings > Import backup** on the other. Automatic sync is planned for Phase 3.

## Staying up to date with ChatGPT and Claude

Every Monday, GitHub checks the official ChatGPT and Claude release notes and opens an issue if anything is new, so GitHub emails you. Details and a ready prompt for adding new features are in [`docs/UPDATES.md`](docs/UPDATES.md).

## Things to know

- **Your keys stay in this browser on this device.** Don't add them on a shared or office computer.
- **Connectors run tools without asking first.** Only add MCP servers you trust. Claude and OpenAI connect to them from their own servers, so the server must be reachable on the internet with `https://`. Servers that only run on your PC won't work here.
- **Costs**: each answer shows its tokens. Long chats and attached files cost more because the whole chat is sent again with each new message. Start a new chat for a new topic to keep costs low.
- Word and Excel files aren't supported yet. Save them as PDF first.

## Project files

```
index.html            the app page
css/app.css           design
js/app.js             screens, chat history, library, settings
js/providers.js       Claude (Anthropic) and OpenAI API calls, in one place
js/db.js              on-device storage (IndexedDB)
js/md.js              formatting answers (Markdown), code copy and preview
sw.js                 offline support
manifest.webmanifest  install info (name, icons)
tools/check_updates.py   update tracker
tools/build_extension.py builds the Chrome extension
docs/FEATURES.md      ChatGPT vs Claude vs Sabeel checklist and roadmap
docs/UPDATES.md       how update tracking works
```

To try it on your computer without hosting: run `python3 -m http.server 8000` in this folder and open http://localhost:8000.
