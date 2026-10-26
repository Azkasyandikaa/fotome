"""
Pecah folder "Random" jadi folder template per PNG — biar nggak upload satu-satu.

    public/booth/templates/Random1/66.png
        -> public/booth/templates/random66/frame.png
        -> public/booth/templates/random66/template.json

Lubang foto di frame-frame ini TRANSPARAN (alpha 0), jadi slot-nya dideteksi
otomatis: cari persegi transparan besar, lalu koordinatnya diskalakan ke kanvas
640x1920 (kanvas yang sama dipakai semua template booth).

Pemakaian:
    python scripts/split-random-frames.py            # dry-run: laporan doang
    python scripts/split-random-frames.py --apply    # eksekusi (pindah + tulis json)

Folder RandomN asli dikosongkan oleh proses pindah ini (file-nya dipindah,
bukan dicopy) lalu dihapus kalau sudah kosong. Folder template lain tidak
disentuh.
"""
import json
import re
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
TPL = ROOT / "public" / "booth" / "templates"
SRC_RE = re.compile(r"^Random\d+$", re.IGNORECASE)
NAME_RE = re.compile(r"^(\d+)\.png$", re.IGNORECASE)

CANVAS_W, CANVAS_H = 640, 1920

# ---- deteksi lubang foto ----------------------------------------------------
ALPHA_MAX = 64      # alpha di bawah ini = transparan (lubang)
MIN_RUN = 70        # baris berlubang butuh >= ini px transparan (buang border/teks)
COL_FILL = 0.70     # kolom = bagian lubang kalau >= 70% baris pita transparan
MIN_W, MIN_H = 120, 90   # lubang lebih kecil dari ini = dekorasi, bukan lubang foto
FILL_MIN = 0.72     # rasio transparan di dalam bbox (lubang = persegi padat)


def detect_slots(path):
    """-> (size, slots, boxes_px). Lubang = persegi transparan besar di frame."""
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    mask = np.asarray(im.getchannel("A")) < ALPHA_MAX  # (h, w) bool

    # 1. Baris berlubang: banyak piksel transparan horizontal.
    hole_rows = mask.sum(axis=1) >= MIN_RUN

    # 2. Kelompokkan baris berurutan jadi pita vertikal (satu pita = satu lubang).
    boxes = []
    y = 0
    while y < h:
        if not hole_rows[y]:
            y += 1
            continue
        y0 = y
        while y < h and hole_rows[y]:
            y += 1
        y1 = y - 1
        bh = y1 - y0 + 1
        if bh < MIN_H:
            continue
        # 3. Sisi kiri/kanan dari profil kolom pita (dekorasi cuma menutup
        #    sebagian baris, jadi ambang 70% tetap lolos).
        band = mask[y0 : y1 + 1]
        cols = np.flatnonzero(band.sum(axis=0) >= bh * COL_FILL)
        if cols.size == 0:
            continue
        x0, x1 = int(cols[0]), int(cols[-1]) + 1
        bw = x1 - x0
        if bw < MIN_W:
            continue
        if band[:, x0:x1].mean() < FILL_MIN:
            continue
        boxes.append((x0, y0, bw, bh))

    boxes.sort(key=lambda b: b[1])  # atas -> bawah = urutan foto 1, 2, 3, ...
    sx, sy = CANVAS_W / w, CANVAS_H / h
    slots = [
        {
            "photoIndex": i,
            "x": round(x * sx),
            "y": round(y * sy),
            "width": round(bw * sx),
            "height": round(bh * sy),
        }
        for i, (x, y, bw, bh) in enumerate(boxes)
    ]
    return im.size, slots, boxes


def main():
    apply = "--apply" in sys.argv
    debug = None
    for arg in sys.argv[1:]:
        if arg.startswith("--debug="):
            debug = Path(arg.split("=", 1)[1])
            debug.mkdir(parents=True, exist_ok=True)
    folders = sorted(p for p in TPL.iterdir() if p.is_dir() and SRC_RE.match(p.name))
    if not folders:
        print("Tidak ada folder Random ditemukan di", TPL)
        return 1

    moved, skipped, failed = 0, [], []
    for folder in folders:
        pngs = sorted(
            (p for p in folder.iterdir() if p.is_file() and NAME_RE.match(p.name)),
            key=lambda p: int(NAME_RE.match(p.name).group(1)),
        )
        print(f"\n== {folder.name} ({len(pngs)} png)")
        for src in pngs:
            num = NAME_RE.match(src.name).group(1)
            dest = TPL / f"random{num}"
            try:
                size, slots, boxes_px = detect_slots(src)
            except Exception as exc:  # corrupt / bukan png
                failed.append(f"{src.name}: {exc}")
                continue
            if not slots:
                skipped.append(str(src.relative_to(ROOT)))
                print(f"   {src.name}: TIDAK ADA lubang terdeteksi -> dilewati")
                continue
            print(f"   {src.name} -> {dest.name}  {len(slots)} slot  {size}")
            if debug:
                over = Image.open(src).convert("RGBA")
                draw = ImageDraw.Draw(over)
                for (x, y, bw, bh) in boxes_px:
                    draw.rectangle([x, y, x + bw - 1, y + bh - 1], outline=(255, 0, 0, 255), width=6)
                over.convert("RGB").resize((over.width // 2, over.height // 2)).save(debug / f"{dest.name}.jpg", quality=72)
            if not apply:
                continue
            dest.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), dest / "frame.png")
            config = {
                "name": f"Random {int(num)}",
                "photoSlots": slots,
                "description": "Drop-in frame dari public/booth/templates.",
                "canvas": {"width": CANVAS_W, "height": CANVAS_H},
                "background": "#fffdf8",
            }
            (dest / "template.json").write_text(
                json.dumps(config, indent=2) + "\n", encoding="utf-8"
            )
            moved += 1

        if apply:
            # Folder sumber jadi kosong -> hapus (isinya sudah pindah semua).
            left = list(folder.iterdir())
            if not left:
                folder.rmdir()
                print(f"   folder {folder.name} kosong -> dihapus")
            else:
                print(f"   folder {folder.name} masih berisi {len(left)} file -> dipertahankan")

    print("\n--- ringkasan")
    print(f"template baru : {moved if apply else f'{moved} (dry-run)'}")
    print(f"dilewati      : {len(skipped)}")
    for s in skipped:
        print("   -", s)
    if failed:
        print(f"gagal baca    : {len(failed)}")
        for f in failed:
            print("   -", f)
    if not apply:
        print("\n(ini dry-run — jalankan dengan --apply untuk eksekusi)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
