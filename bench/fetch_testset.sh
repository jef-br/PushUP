#!/usr/bin/env bash
# Download the e-commerce benchmark sources from Hugging Face and build the test set.
#   bench/out/set    60 images (40 Amazon Berkeley Objects + 20 Lamoda), largest side >= 1000 px
#   bench/out/sub20  20-image subset (13 ABO + 7 Lamoda) for slow models
# Needs: curl, python3 with pyarrow + pillow (installed below if missing).
set -euo pipefail
cd "$(dirname "$0")"
OUT=out
mkdir -p "$OUT"
HF=https://huggingface.co/datasets
# get URL FILE: download once; resumes a partial download; skips if FILE exists.
get() {
  if [ -s "$2" ]; then return 0; fi
  curl -fL --retry 3 -C - -o "$2.part" "$1"
  mv "$2.part" "$2"
}
get "$HF/huggingface/amazon-berkeley-objects/resolve/main/images_original/train-00000.parquet" "$OUT/abo.parquet"
get "$HF/PestoRosso/lamoda-fashion-product-images/resolve/main/data/train_part_0000.parquet" "$OUT/lamoda.parquet"
python3 -c "import pyarrow, PIL" 2>/dev/null || pip install --quiet pyarrow pillow
if [ ! -d "$OUT/set" ] || [ "$(ls "$OUT/set" | wc -l)" -lt 60 ]; then
  python3 build_testset.py "$OUT/abo.parquet" "$OUT/lamoda.parquet" "$OUT/set"
fi
# Fixed 20-image subset: every 3rd image, 13 ABO + 7 Lamoda.
rm -rf "$OUT/sub20"; mkdir -p "$OUT/sub20"
for f in $(ls "$OUT/set" | grep '^abo_' | awk 'NR%3==1' | head -13) $(ls "$OUT/set" | grep '^lamoda_' | awk 'NR%3==1' | head -7); do
  cp "$OUT/set/$f" "$OUT/sub20/$f"
done
echo "set: $(ls "$OUT/set" | wc -l) images, sub20: $(ls "$OUT/sub20" | wc -l) images"
