"""Compare PushUP with a SaaS upscaler using the vendor's own published before/after pair.

No account, no API key, no spending: the vendor's marketing page shows a "before" image and
its own "after". We upscale the same "before" with PushUP, align the vendor's "after" onto our
output (SIFT + RANSAC similarity transform, because vendors often reframe or crop), and write
side-by-side crops. There is no ground truth, so this is a visual comparison, not a score.

The images are the vendor's copyrighted marketing material: they are downloaded at run time
into bench/out/saas/ (git-ignored) and never committed.

Usage (from the repo root; needs claid.ai in the network allowlist):
    pip install opencv-python-headless numpy
    python bench/saas/compare_published.py
"""
import json
import os
import re
import subprocess
import sys
import urllib.request

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "bench", "out", "saas")

# Claid.ai "enhancement" product page: one before/after pair (sneakers). The page is a Gatsby
# site; its content and image variants are listed in the page-data JSON.
PAGE_DATA = "https://claid.ai/page-data/product/enhancement/page-data.json"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "pushup-bench"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def largest_variant(paths, name):
    """Gatsby serves several resized copies; download each and keep the largest."""
    best = None
    for p in sorted(x for x in paths if f"/{name}" in x and x.endswith(".jpg")):
        data = fetch("https://claid.ai" + p)
        img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        if best is None or img.shape[1] > best[1].shape[1]:
            best = (p, img)
    if best is None:
        sys.exit(f"{name} not found on the page (page layout changed?)")
    return best


def align(moving, fixed):
    """Similarity transform mapping `moving` onto `fixed` (SIFT + RANSAC)."""
    sift = cv2.SIFT_create(4000)
    g1 = cv2.cvtColor(fixed, cv2.COLOR_BGR2GRAY)
    g2 = cv2.cvtColor(moving, cv2.COLOR_BGR2GRAY)
    k1, d1 = sift.detectAndCompute(g1, None)
    k2, d2 = sift.detectAndCompute(g2, None)
    pairs = cv2.BFMatcher().knnMatch(d2, d1, k=2)
    good = [a for a, b in pairs if a.distance < 0.7 * b.distance]
    src = np.float32([k2[a.queryIdx].pt for a in good])
    dst = np.float32([k1[a.trainIdx].pt for a in good])
    m, inliers = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=2.0)
    if m is None or inliers.sum() < 30:
        sys.exit(f"alignment failed ({0 if inliers is None else int(inliers.sum())} inliers)")
    warped = cv2.warpAffine(moving, m, (fixed.shape[1], fixed.shape[0]), flags=cv2.INTER_LANCZOS4)
    return warped, int(inliers.sum()), len(good)


def main():
    os.makedirs(OUT, exist_ok=True)
    text = fetch(PAGE_DATA).decode()
    paths = set(re.findall(r"/static/[0-9a-f]+/[0-9a-f]{5}/[A-Za-z0-9_]+\.jpg", text))
    before_p, before = largest_variant(paths, "Main_Before_")
    after_p, after = largest_variant(paths, "Main_After_")
    cv2.imwrite(os.path.join(OUT, "before.png"), before)
    print(f"before {before.shape[1]}x{before.shape[0]} ({before_p})")
    print(f"vendor after {after.shape[1]}x{after.shape[0]} ({after_p})")

    # PushUP fast + high (CPU) and plain Lanczos, all to a 1000 px longest side.
    subprocess.run(["node", os.path.join(ROOT, "bench", "saas", "upscale_file.js"),
                    os.path.join(OUT, "before.png"), OUT], check=True)
    ref = cv2.imread(os.path.join(OUT, "pushup_fast.png"))
    vendor, inl, matches = align(after, ref)
    cv2.imwrite(os.path.join(OUT, "vendor_aligned.png"), vendor)
    print(f"aligned vendor output: {inl} inliers of {matches} matches")

    cols = [("Lanczos", "lanczos.png"), ("PushUP fast", "pushup_fast.png"),
            ("PushUP high", "pushup_high.png"), ("Claid (aligned)", "vendor_aligned.png")]
    ims = [cv2.imread(os.path.join(OUT, f)) for _, f in cols]
    # Crops in the 1000 px frame: logo + laces, suede + swoosh, toe + sole.
    crops = [(150, 140, 400, 330), (70, 250, 320, 450), (560, 380, 810, 560)]
    rows = [np.hstack([np.pad(im[y0:y1, x0:x1], ((2, 2), (2, 2), (0, 0)), constant_values=255)
                       for im in ims]) for x0, y0, x1, y1 in crops]
    sheet = np.vstack(rows)
    hdr = np.full((24, sheet.shape[1], 3), 255, np.uint8)
    for i, (label, _) in enumerate(cols):
        cv2.putText(hdr, label, (i * 254 + 5, 17), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1)
    path = os.path.join(OUT, "compare.png")
    cv2.imwrite(path, np.vstack([hdr, sheet]))
    print("wrote", path)
    json.dump({"before": before_p, "after": after_p, "inliers": inl}, open(os.path.join(OUT, "sources.json"), "w"), indent=2)


if __name__ == "__main__":
    main()
