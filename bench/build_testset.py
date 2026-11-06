"""Build a reproducible e-commerce test set for bench/bench.js.

Sources (Hugging Face):
  - huggingface/amazon-berkeley-objects, images_original shard 0 (Amazon catalog, CC BY 4.0)
  - PestoRosso/lamoda-fashion-product-images, data part 0 (on-model fashion, MIT)

Keeps images whose largest side is >= 1000 px, so a sharp 1000 px
ground truth exists. Writes PNGs to OUT_DIR.

Usage: python bench/build_testset.py abo.parquet lamoda.parquet OUT_DIR [N_ABO] [N_LAMODA]
"""
import io, os, random, sys
import pyarrow.parquet as pq
from PIL import Image

abo, lamoda, out = sys.argv[1:4]
n_abo = int(sys.argv[4]) if len(sys.argv) > 4 else 40
n_lam = int(sys.argv[5]) if len(sys.argv) > 5 else 20
os.makedirs(out, exist_ok=True)
rng = random.Random(1234)

def save(raw, name):
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    if max(im.size) < 1000:
        return False
    im.save(os.path.join(out, name + ".png"))
    return True

t = pq.read_table(abo, columns=["image_id", "width", "height"]).to_pylist()
idx = [i for i, r in enumerate(t) if max(r["width"], r["height"]) >= 1000]
rng.shuffle(idx)
pick = sorted(idx[:n_abo])
imgs = pq.read_table(abo, columns=["image"]).column("image")
for i in pick:
    save(imgs[i].as_py()["bytes"], "abo_" + t[i]["image_id"])

t = pq.read_table(lamoda, columns=["id", "width", "height", "article_type", "image"]).to_pylist()
cand = [r for r in t if max(r["width"], r["height"]) >= 1000]
rng.shuffle(cand)
for r in cand[:n_lam]:
    save(r["image"], "lamoda_%s_%s" % (r["article_type"].replace(" ", ""), r["id"]))
print("wrote", len(os.listdir(out)), "images to", out)
