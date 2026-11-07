#!/usr/bin/env python3
"""Builds the Sabeel Chrome extension (opens Sabeel in Chrome's side panel).

Usage:  python3 tools/build_extension.py
Output: dist/sabeel-extension/  (load it in chrome://extensions with "Load unpacked")
        dist/sabeel-extension.zip
"""
import json
import pathlib
import re
import shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "dist" / "sabeel-extension"
COPY = ["index.html", "manifest.webmanifest", "css", "js", "vendor", "fonts", "icons"]


def main():
    version = re.search(r"VERSION = '([\d.]+)'", (ROOT / "js" / "app.js").read_text()).group(1)
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    for item in COPY:
        src = ROOT / item
        if src.is_dir():
            shutil.copytree(src, OUT / item)
        else:
            shutil.copy2(src, OUT / item)

    manifest = {
        "manifest_version": 3,
        "name": "Sabeel",
        "version": version,
        "description": "Claude and ChatGPT models, images and connectors in Chrome's side panel, using your own API keys.",
        "icons": {"16": "icons/icon-16.png", "48": "icons/icon-48.png", "128": "icons/icon-128.png"},
        "action": {"default_title": "Open Sabeel", "default_icon": {"16": "icons/icon-16.png", "48": "icons/icon-48.png"}},
        "side_panel": {"default_path": "index.html"},
        "permissions": ["sidePanel"],
        "host_permissions": ["https://api.anthropic.com/*", "https://api.openai.com/*"],
        "background": {"service_worker": "background.js"},
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    (OUT / "background.js").write_text(
        "// Clicking the Sabeel icon opens the side panel.\n"
        "chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});\n"
    )
    zip_path = shutil.make_archive(str(OUT), "zip", OUT)
    print(f"Built {OUT}\nZipped {zip_path}")


if __name__ == "__main__":
    main()
