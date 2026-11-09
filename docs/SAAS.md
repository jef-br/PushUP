# PushUP vs. SaaS upscalers

How we compare without accounts, API keys or spending (owner rule): use the vendor's **own
published before/after examples**. We upscale the vendor's "before" with PushUP, align the
vendor's "after" onto our output, and compare crops side by side. There's no ground truth,
so this is visual evidence, and vendor examples are hand-picked best cases.

Reproduce: `python bench/saas/compare_published.py` (needs `claid.ai` allowed; images are
downloaded into `bench/out/saas/`, never committed — they're the vendor's copyrighted material).

## Claid.ai — enhancement page sample (2026-11-09)

- Source: `https://claid.ai/page-data/product/enhancement/page-data.json`, images
  `Main_Before_647ade74b2` (640×428, in our 400–800 px input range) and
  `Main_After_2e6a81d840` (3232×2160). Sneakers (blue suede, white sole, laces, logo).
- Claid's "after" is their full enhancement pipeline, not a pure upscale: the background is
  removed, the shoes reframed and relit. Alignment: SIFT + RANSAC, 189 of 220 matches agree.
- We can't verify that Claid's "after" was made from this 640 px "before" rather than a
  sharper original.

| | Lanczos | PushUP `fast` (1.2 s) | PushUP `high` (35 s, CPU) | Claid |
|---|---|---|---|---|
| Suede texture | blurry | clean, smooth | clean, slightly more grain | **dense fibre-level texture** |
| Laces, logo | soft | crisp edges | crisp edges | crisp, "NIKE" sharper |
| Faithfulness | — | follows the input | follows the input | adds texture, relights |

Also tried on the same image, all converted ESRGAN-type community models: NMKD-Siax,
4x-UltraSharp, 4x-Nomos8kSC. None reaches Claid's suede texture; Siax comes closest.

**Verdict:** on Claid's showcase image, PushUP is clean and faithful but **behind on fine
texture**. The look of Claid's result is typical of generative (diffusion-style) upscalers,
which invent plausible material texture. Closing this gap is task T7.

## Other vendors

Not yet compared: needs each vendor's site and image CDN added to the environment's network
allowlist, which only an interactive session can request (task T3c).
