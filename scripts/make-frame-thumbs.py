"""
Bikin preview ringan (thumb.png) buat frame booth yang belum punya.

Frame tanpa thumb.png bikin halaman developer (#/admin) dan pemilihan frame
memuat frame.png penuh (~0.5-1.5 MB per frame) cuma buat preview kecil —
lambat, apalagi frame-nya ratusan. Isi tiap folder:

    <folder>/frame.png   ->   <folder>/thumb.png   (lebar 240px, PNG palet 256 warna)

Scanner booth (server/booth-scan.js) otomatis memakai thumb.* kalau ada;
kalau tidak ada, klien jatuh balik ke frame.png (berat).

Pemakaian:
    python scripts/make-frame-thumbs.py                     # semua frame tanpa thumb
    python scripts/make-frame-thumbs.py --only=random       # cuma folder yang namanya cocok
    python scripts/make-frame-thumbs.py --width=320         # lebar thumb lain
    python scripts/make-frame-thumbs.py --apply             # eksekusi (default: dry-run)
"""
import io
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TPL = ROOT / "public" / "booth" / "templates"
DEFAULT_WIDTH = 240


def main() -> int:
    apply = "--apply" in sys.argv
    width = DEFAULT_WIDTH
    only = None
    for arg in sys.argv[1:]:
        if arg.startswith("--width="):
            width = max(64, int(arg.split("=", 1)[1]))
        elif arg.startswith("--only="):
            only = re.compile(arg.split("=", 1)[1], re.IGNORECASE)

    folders = sorted(
        d
        for d in TPL.iterdir()
        if d.is_dir() and (d / "frame.png").exists() and not any(d.glob("thumb.*"))
    )
    if only:
        folders = [d for d in folders if only.search(d.name)]
    if not folders:
        print("Semua frame sudah punya thumb — tidak ada yang perlu dibuat.")
        return 0

    made, total = 0, 0
    for folder in folders:
        src = folder / "frame.png"
        try:
            im = Image.open(src).convert("RGBA")
        except Exception as exc:
            print(f"   {folder.name}: gagal dibaca ({exc}) — dilewati")
            continue
        w, h = im.size
        tw = min(width, w)
        th = max(1, round(h * tw / w))
        # Palet 256 warna (FASTOCTREE jaga alpha) -> jauh lebih kecil dari RGBA.
        small = im.resize((tw, th), Image.LANCZOS).quantize(
            colors=256, method=Image.FASTOCTREE
        )
        buf = io.BytesIO()
        small.save(buf, "PNG", optimize=True)
        size_kb = buf.tell() / 1024
        total += size_kb
        print(f"   {folder.name}: {w}x{h} ({src.stat().st_size / 1024:.0f} KB) -> thumb {tw}x{th} ({size_kb:.0f} KB)")
        if apply:
            (folder / "thumb.png").write_bytes(buf.getvalue())
        made += 1

    print(
        f"\n{made} thumb{' (dry-run)' if not apply else ' dibuat'} · "
        f"rata-rata {total / max(made, 1):.0f} KB per thumb"
    )
    if not apply:
        print("(ini dry-run — jalankan dengan --apply untuk eksekusi)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
