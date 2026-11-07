#!/usr/bin/env python3
"""Sabeel update tracker.

Reads the official ChatGPT / Claude / API release-notes pages, compares them
with the copy saved last time, and writes any new lines to updates/LATEST.md.

Usage:  python3 tools/check_updates.py
Only uses the Python standard library, so it runs anywhere (including GitHub Actions).

Exit code is always 0. If there are new updates, the file updates/HAS_CHANGES is created.
For testing without internet, set SABEEL_FIXTURES=<folder> containing <source-id>.html files.
"""
import datetime
import html.parser
import os
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
SNAP_DIR = ROOT / "updates" / "snapshots"
LATEST = ROOT / "updates" / "LATEST.md"
FLAG = ROOT / "updates" / "HAS_CHANGES"

# (id, title, official url, backup url or None)
SOURCES = [
    ("chatgpt-app", "ChatGPT app",
     "https://help.openai.com/en/articles/6825453-chatgpt-release-notes", None),
    ("claude-app", "Claude app",
     "https://support.claude.com/en/articles/12138966-release-notes",
     "https://releases.sh/anthropic/claude-releases.md"),
    ("claude-api", "Claude API",
     "https://platform.claude.com/docs/en/release-notes/overview.md",
     "https://platform.claude.com/docs/en/release-notes/overview"),
    ("openai-api", "OpenAI API",
     "https://developers.openai.com/api/docs/changelog",
     "https://releases.sh/openai/openai-api-changelog.md"),
]

MAX_LINES_PER_SOURCE = 60
USER_AGENT = "Mozilla/5.0 (compatible; SabeelUpdateTracker/0.1)"


class TextExtractor(html.parser.HTMLParser):
    BLOCK = {"p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "br", "section", "article", "td", "th", "dt", "dd"}
    SKIP = {"script", "style", "noscript", "svg", "nav", "footer", "header", "head"}

    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.skip += 1
        elif tag in self.BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.skip:
            self.skip -= 1
        elif tag in self.BLOCK:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def to_lines(raw: str) -> list:
    if "<html" in raw[:2000].lower() or "<body" in raw.lower():
        p = TextExtractor()
        p.feed(raw)
        text = "".join(p.parts)
    else:
        text = raw  # markdown or plain text
    lines, seen = [], set()
    for line in text.splitlines():
        line = re.sub(r"\s+", " ", line).strip()
        line = re.sub(r"^[#>*\-\s]+", "", line)          # drop markdown markers
        line = re.sub(r"\]\([^)]*\)", "]", line)          # drop link targets
        if len(line) < 12 or line in seen:
            continue
        if re.fullmatch(r"(Updated|Last updated|Dikemas kini)[: ].*(ago|yesterday)?", line, re.I):
            continue  # "Updated: 3 hours ago" changes every run
        seen.add(line)
        lines.append(line)
    return lines


def fetch(source_id: str, url: str) -> str:
    fixtures = os.environ.get("SABEEL_FIXTURES")
    if fixtures:
        path = pathlib.Path(fixtures) / f"{source_id}.html"
        if not path.exists():
            raise FileNotFoundError(path)
        return path.read_text(encoding="utf-8")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,text/markdown,*/*"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")


def main() -> int:
    SNAP_DIR.mkdir(parents=True, exist_ok=True)
    if FLAG.exists():
        FLAG.unlink()
    today = datetime.date.today().isoformat()
    report = [f"# AI updates check: {today}", ""]
    any_new = False
    problems = []

    for sid, title, url, backup in SOURCES:
        raw, used = None, None
        for candidate in [url] + ([backup] if backup else []):
            try:
                raw = fetch(sid, candidate)
                used = candidate
                if len(to_lines(raw)) >= 5:
                    break
            except Exception as e:  # noqa: BLE001
                problems.append(f"{title}: couldn't read {candidate} ({e.__class__.__name__}: {e})")
                raw = None
        if raw is None:
            report += [f"## {title}", "", "Couldn't read this page this time. It will be tried again next run.", ""]
            continue

        new_lines = to_lines(raw)
        snap = SNAP_DIR / f"{sid}.txt"
        if not snap.exists():
            snap.write_text("\n".join(new_lines), encoding="utf-8")
            report += [f"## {title}", "", f"First run: saved a starting copy of [{used}]({used}). Changes will show from next run.", ""]
            continue

        old = set(snap.read_text(encoding="utf-8").splitlines())
        added = [line for line in new_lines if line not in old]
        snap.write_text("\n".join(new_lines), encoding="utf-8")
        report += [f"## {title}", "", f"Source: {used}", ""]
        if added:
            any_new = True
            for line in added[:MAX_LINES_PER_SOURCE]:
                report.append(f"- {line}")
            if len(added) > MAX_LINES_PER_SOURCE:
                report.append(f"- …and {len(added) - MAX_LINES_PER_SOURCE} more lines. Open the source page to read everything.")
        else:
            report.append("No changes since last check.")
        report.append("")

    if problems:
        report += ["## Pages that couldn't be read", ""] + [f"- {p}" for p in problems] + [""]

    report += ["## Next step", "",
               "For each new feature, check if it appears in the Claude API or OpenAI API section. "
               "If it does, Sabeel can add it. See docs/UPDATES.md for the ready prompt.", ""]
    LATEST.write_text("\n".join(report), encoding="utf-8")
    if any_new:
        FLAG.write_text(today, encoding="utf-8")
    print("\n".join(report))
    return 0


if __name__ == "__main__":
    sys.exit(main())
