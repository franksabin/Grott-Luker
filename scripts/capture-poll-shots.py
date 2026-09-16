"""Capture the report column of each CPA tool (sample data loaded) for the poll page.

Usage: python scripts/capture-poll-shots.py   (dev server on http://localhost:5174)
Writes public/poll/<tool-id>.jpg. Re-run after a tool's report changes.
"""
import os, subprocess, sys, tempfile
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "poll")
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
BASE = "http://localhost:5174"
TOOLS = [
    "estimated-tax",
    "multi-year-projection",
    "roth-conversion",
    "retirement-tax-map",
    "withholding-checkup",
    "capital-gains-harvesting",
    "charitable-giving-optimizer",
]
W, H = 1360, 2400          # render size
COL_X0, COL_X1 = 668, 1228 # the report column at this width
SHOT_H = 980               # how much of the report to show
PAGE_BG = (241, 238, 229)  # --bg


def card_top(im):
    """First row (from y=350) where the report column is a white card, not page background."""
    px = im.load()
    for y in range(350, 1200):
        r, g, b = px[720, y][:3]
        if r > 250 and g > 250 and b > 250:
            return y
    return 480


def main():
    os.makedirs(OUT, exist_ok=True)
    profile = os.path.join(tempfile.gettempdir(), "gl-poll-shots-profile")
    for tid in TOOLS:
        raw = os.path.join(tempfile.gettempdir(), f"gl-shot-{tid}.png")
        url = f"{BASE}/tools/{tid}?sample=1"
        subprocess.run([
            EDGE, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
            f"--user-data-dir={profile}", f"--window-size={W},{H}", "--virtual-time-budget=9000",
            f"--screenshot={raw}", url,
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=90)
        im = Image.open(raw).convert("RGB")
        top = card_top(im)
        crop = im.crop((COL_X0, top - 6, COL_X1, min(H, top - 6 + SHOT_H)))
        # Fade the bottom edge so the cut does not look like a hard clip.
        fade = Image.new("L", crop.size, 255)
        fp = fade.load()
        for y in range(crop.size[1] - 90, crop.size[1]):
            v = int(255 * (crop.size[1] - y) / 90)
            for x in range(crop.size[0]):
                fp[x, y] = v
        bg = Image.new("RGB", crop.size, PAGE_BG)
        out = Image.composite(crop, bg, fade)
        dest = os.path.join(OUT, f"{tid}.jpg")
        out.save(dest, "JPEG", quality=84, optimize=True)
        print(f"{tid:32s} top={top:4d} -> {os.path.getsize(dest)//1024} KB")


if __name__ == "__main__":
    sys.exit(main())
