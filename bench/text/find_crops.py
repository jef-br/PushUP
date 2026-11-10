"""T1a step 1: OCR the 1000 px references and select text-line crops.
Usage: python3 -I find_crops.py <set_dir> <out.json>
References are built like bench/bench.js: image resized to 1000 px largest side (Lanczos)."""
import sys, json, os
from PIL import Image
import numpy as np
from rapidocr_onnxruntime import RapidOCR

PAD = 8
def reference(path):
    im = Image.open(path).convert('RGB')
    w, h = im.size; L = max(w, h)
    return im.resize((round(w * 1000 / L), round(h * 1000 / L)), Image.LANCZOS)

if __name__ == '__main__':
    d, out = sys.argv[1], sys.argv[2]
    ocr = RapidOCR()
    crops = []
    for f in sorted(os.listdir(d)):
        ref = reference(os.path.join(d, f))
        res, _ = ocr(np.array(ref))
        for box, text, conf in (res or []):
            conf = float(conf)
            if conf < 0.90 or len(text) < 4: continue
            xs = [p[0] for p in box]; ys = [p[1] for p in box]
            x0 = max(0, int(min(xs)) - PAD); y0 = max(0, int(min(ys)) - PAD)
            x1 = min(ref.width, int(max(xs)) + PAD); y1 = min(ref.height, int(max(ys)) + PAD)
            crops.append(dict(image=f, box=[x0, y0, x1, y1], ref_text=text, ref_conf=conf))
    json.dump(crops, open(out, 'w'), indent=1)
    print(len(crops), 'crops from', len({c['image'] for c in crops}), 'images')
