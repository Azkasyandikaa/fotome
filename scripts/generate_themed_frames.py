#!/usr/bin/env python3
"""
generate_themed_frames.py — membuat 20 template bingkai fotobooth bertema.

Setiap template = 1 folder di public/booth/templates/ berisi:
  frame.png       overlay 1080x1920; area foto dibuat TRANSPARAN (alpha=0)
  thumb.png       preview kecil 270x480 untuk picker
  template.json   posisi slot foto (harus SAMA persis dengan lubang di frame.png)

Sumber dekorasi: PNG transparan dari https://www.pngall.com (lihat SOURCES.md).
Pemakaian:
  python scripts/generate_themed_frames.py <folder-decorasi> <folder-output-templates>

Kuncinya ada di SLOT di bawah — ubah di satu tempat, lubang frame + template.json
ikut otomatis, jadi tidak pernah meleset.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

CANVAS_W, CANVAS_H = 1080, 1920

# Lubang foto (juga yang ditulis ke template.json).
SLOT_W, SLOT_H = 860, 480
SLOT_X = 110
SLOT_YS = [340, 850, 1360]

BORDER = 18  # garis bingkai putih sekeliling lubang foto

FONT_BOLD = "C:/Windows/Fonts/arialbd.ttf"
FONT_IMPACT = "C:/Windows/Fonts/impact.ttf"
FONT_SERIF = "C:/Windows/Fonts/georgiab.ttf"

# ---------------------------------------------------------------- tema ------
# deco      = nama file di folder dekorasi ( hasil download )
# bg        = warna latar template (template.json "background")
# accent    = warna garis bingkai lubang foto + stripe samping
# title     = teks besar di kepala frame (di-bake ke PNG)
# footer    = teks kecil di kaki frame
# name      = nama tampilan di picker
# category  = kategori filter picker
# keywords  = kata kunci pencarian
# font      = path font untuk judul
# tcolor    = warna judul, outline = warna tepi teks
THEMES = [
    dict(deco="birthday", name="Ulang Tahun", category="party",
         bg="#fff1e0", accent="#ff5f8f", tcolor="#e0356f", outline="#ffffff",
         title="SELAMAT ULANG TAHUN!", footer="PARTY TIME",
         keywords=["ulang tahun", "birthday", "pesta", "balon", "party", "kue"],
         description="Bingkai pesta ulang tahun dengan balon warna-warni.",
         font=FONT_BOLD),
    dict(deco="wedding", name="Pernikahan", category="romance",
         bg="#fdf7f0", accent="#c9a227", tcolor="#8a6d1d", outline="#ffffff",
         title="FOREVER & ALWAYS", footer="WEDDING MOMENT",
         keywords=["pernikahan", "wedding", "pengantin", "mawar", "putih", "emas"],
         description="Bingkai elegan pernikahan dengan mawar putih dan emas.",
         font=FONT_SERIF),
    dict(deco="christmas", name="Natal", category="holiday",
         bg="#f3f7ef", accent="#c0392b", tcolor="#1e7a3c", outline="#ffffff",
         title="MERRY CHRISTMAS!", footer="SEASON'S GREETINGS",
         keywords=["natal", "christmas", "santa", "rukun", "merah", "hijau", "libur"],
         description="Bingkai Natal dengan ornamen merah-hijau.",
         font=FONT_BOLD),
    dict(deco="halloween", name="Halloween", category="spooky",
         bg="#241a33", accent="#ff7518", tcolor="#ff8c2b", outline="#120b1c",
         title="HAPPY HALLOWEEN", footer="TRICK OR TREAT",
         keywords=["halloween", "labu", "hantu", "spooky", "kelelawar", "gelap"],
         description="Bingkai Halloween gelap dengan labu dan hantu.",
         font=FONT_IMPACT),
    dict(deco="valentine", name="Valentine", category="love",
         bg="#fff0f4", accent="#e8365d", tcolor="#d6285a", outline="#ffffff",
         title="HAPPY VALENTINE", footer="LOVE IS IN THE AIR",
         keywords=["valentine", "cinta", "love", "hati", "kasih", "pink"],
         description="Bingkai Valentine penuh hati merah dan pink.",
         font=FONT_SERIF),
    dict(deco="retro", name="Retro Film", category="retro",
         bg="#f6ead6", accent="#8a6642", tcolor="#6b4a2b", outline="#ffffff",
         title="RETRO MOMENTS", footer="ANALOG VIBE",
         keywords=["retro", "vintage", "film", "polaroid", "kuno", "analog"],
         description="Nuansa retro polaroid kayu hangat.",
         font=FONT_SERIF),
    dict(deco="summer", name="Summer Beach", category="summer",
         bg="#e8f6fb", accent="#00a8cc", tcolor="#0083a8", outline="#ffffff",
         title="SUMMER VIBES", footer="SUN, SEA, SMILE",
         keywords=["summer", "panas", "pantai", "beach", "palem", "laut", "liburan"],
         description="Bingkai musim panas dengan siluet pohon palem.",
         font=FONT_BOLD),
    dict(deco="tropical", name="Tropis", category="nature",
         bg="#eef7ec", accent="#2e8b57", tcolor="#257a49", outline="#ffffff",
         title="TROPICAL PARADISE", footer="GO WILD & GREEN",
         keywords=["tropis", "tropical", "daun", "pohon", "hutan", "hijau", "alam"],
         description="Bingkai tropis dengan daun rindang.",
         font=FONT_BOLD),
    dict(deco="floral", name="Bunga", category="floral",
         bg="#fdf4f6", accent="#e58aa5", tcolor="#c9648a", outline="#ffffff",
         title="BLOOM & GLOW", footer="FLOWER POWER",
         keywords=["bunga", "floral", "mawar", "watercolor", "mei", "taman"],
         description="Bingkai bunga watercolor lembut.",
         font=FONT_SERIF),
    dict(deco="neon", name="Neon Nights", category="nightlife",
         bg="#14121f", accent="#ff2d78", tcolor="#39d7ff", outline="#0b0a12",
         title="NEON NIGHTS", footer="GLOW ALL NIGHT",
         keywords=["neon", "malam", "club", "party", "wing", "sayap", "glow"],
         description="Bingkai neon sayap pelangi di kegelapan.",
         font=FONT_IMPACT),
    dict(deco="gold", name="Kemewahan Emas", category="luxury",
         bg="#171310", accent="#d4af37", tcolor="#e8c968", outline="#0c0a08",
         title="GOLDEN MOMENT", footer="PURE LUXURY",
         keywords=["emas", "gold", "mewah", "luxury", "ornamen", "mahkota"],
         description="Bingkai ornamen emas mewah di latar hitam.",
         font=FONT_SERIF),
    dict(deco="graduation", name="Wisuda", category="school",
         bg="#eef2fa", accent="#27447f", tcolor="#27447f", outline="#ffffff",
         title="HAPPY GRADUATION", footer="CLASS OF THE YEAR",
         keywords=["wisuda", "graduation", "topi", "sekolah", "kelulusan", "kampus"],
         description="Bingkai wisuda dengan toga dan medali emas.",
         font=FONT_BOLD),
    dict(deco="newyear", name="Tahun Baru", category="holiday",
         bg="#0d1b3e", accent="#f5c542", tcolor="#ffd75e", outline="#06102a",
         title="HAPPY NEW YEAR!", footer="CHEERS TO A NEW START",
         keywords=["tahun baru", "new year", "kembang api", "fireworks", "pesta"],
         description="Bingkai tahun baru dengan kembang api.",
         font=FONT_IMPACT),
    dict(deco="galaxy", name="Luar Angkasa", category="space",
         bg="#120f2b", accent="#8f7bff", tcolor="#b3a6ff", outline="#08061a",
         title="OUTER SPACE", footer="TO THE MOON & BACK",
         keywords=["luar angkasa", "galaxy", "roket", "bulan", "astronaut", "space"],
         description="Bingkai luar angkasa dengan roket menuju bulan.",
         font=FONT_IMPACT),
    dict(deco="coffee", name="Kedai Kopi", category="cafe",
         bg="#f4ece2", accent="#7b5231", tcolor="#5d3a1d", outline="#ffffff",
         title="COFFEE TIME", footer="BREWED WITH LOVE",
         keywords=["kopi", "coffee", "kedai", "cafe", "cangkir", "sore"],
         description="Bingkai cozy kedai kopi dengan cangkir beruap.",
         font=FONT_SERIF),
    dict(deco="sports", name="Sepak Bola", category="sports",
         bg="#eaf6e6", accent="#2e9e3e", tcolor="#1f7d2e", outline="#ffffff",
         title="GOOOAL!", footer="PLAY LIKE A CHAMPION",
         keywords=["sepak bola", "soccer", "bola", "gol", "stadion", "olahraga"],
         description="Bingkai sepak bola untuk para juara lapangan.",
         font=FONT_IMPACT),
    dict(deco="music", name="Musik", category="music",
         bg="#f1ecfa", accent="#7c4dbc", tcolor="#6a3cb0", outline="#ffffff",
         title="MUSIC LOVER", footer="PLAY IT LOUD",
         keywords=["musik", "music", "not", "lagu", "band", "konser"],
         description="Bingkai musik dengan not-not bernyanyi.",
         font=FONT_BOLD),
    dict(deco="kawaii", name="Kawaii", category="cute",
         bg="#fff0f6", accent="#ff9ec6", tcolor="#e56aa0", outline="#ffffff",
         title="SO KAWAII!", footer="CUTE MODE ON",
         keywords=["kawaii", "imut", "kelinci", "cute", "pink", "lucu"],
         description="Bingkai imut kelinci pink kawaii.",
         font=FONT_BOLD),
    dict(deco="safari", name="Safari Liar", category="wildlife",
         bg="#f6ecd7", accent="#c97b2c", tcolor="#a55f18", outline="#ffffff",
         title="WILD SAFARI", footer="ROAR OF THE JUNGLE",
         keywords=["safari", "singa", "lion", "hutan", "binatang", "savanna"],
         description="Bingkai safari dengan singa ramah.",
         font=FONT_IMPACT),
    dict(deco="starry", name="Malam Berbintang", category="night",
         bg="#0e1a38", accent="#f0c94c", tcolor="#ffe08a", outline="#07102a",
         title="UNDER THE STARS", footer="GOOD NIGHT, DREAM BIG",
         keywords=["bintang", "malam", "starry", "bulan", "langit", "malam hari"],
         description="Bingkai malam berbintang dengan bulan emas.",
         font=FONT_SERIF),
]


def load_font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def fit_contain(img, max_w, max_h):
    """Scale menjaga rasio supaya muat di kotak."""
    ratio = min(max_w / img.width, max_h / img.height)
    return img.resize((max(1, int(img.width * ratio)), max(1, int(img.height * ratio))), Image.LANCZOS)


def outlined_text(draw, xy, text, font, fill, outline, width=6):
    x, y = xy
    for dx in range(-width, width + 1, max(2, width // 2)):
        for dy in range(-width, width + 1, max(2, width // 2)):
            draw.text((x + dx, y + dy), text, font=font, fill=outline)
    draw.text((x, y), text, font=font, fill=fill)


def centered_text(draw, y, text, font, fill, outline=None, width=6):
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    x = (CANVAS_W - w) // 2 - bbox[0]
    if outline:
        outlined_text(draw, (x, y), text, font, fill, outline, width)
    else:
        draw.text((x, y), text, font=font, fill=fill)


def build_frame(theme, deco_img):
    im = Image.new("RGBA", (CANVAS_W, CANVAS_H), theme["bg"])
    draw = ImageDraw.Draw(im)

    # Stripe vertikal kiri-kanan.
    draw.rectangle([44, 330, 58, 1850], fill=theme["accent"])
    draw.rectangle([CANVAS_W - 58, 330, CANVAS_W - 44, 1850], fill=theme["accent"])

    # Dekorasi atas (contain, jaga rasio) + salinan dicerminkan di bawah.
    deco_top = fit_contain(deco_img, CANVAS_W - 300, 220)
    im.alpha_composite(deco_top, ((CANVAS_W - deco_top.width) // 2, 6))
    deco_bot = deco_top.transpose(Image.FLIP_TOP_BOTTOM)
    im.alpha_composite(deco_bot, ((CANVAS_W - deco_bot.width) // 2, CANVAS_H - deco_bot.height - 6))
    draw = ImageDraw.Draw(im)

    # Judul + footer.
    title_font = load_font(theme["font"], 60)
    centered_text(draw, 240, theme["title"], title_font, theme["tcolor"], theme["outline"], 6)
    foot_font = load_font(FONT_BOLD, 30)
    centered_text(draw, 1868, theme["footer"], foot_font, theme["tcolor"], theme["outline"], 4)

    # Bingkai putih tiap lubang foto, lalu lubang dibuat transparan.
    for y in SLOT_YS:
        draw.rectangle(
            [SLOT_X - BORDER, y - BORDER, SLOT_X + SLOT_W + BORDER, y + SLOT_H + BORDER],
            fill="#ffffff",
        )
        draw.rectangle(
            [SLOT_X - BORDER - 4, y - BORDER - 4, SLOT_X + SLOT_W + BORDER + 4, y + SLOT_H + BORDER + 4],
            outline=theme["accent"], width=4,
        )
        # Punch transparan: ImageDraw menulis alpha apa adanya.
        draw.rectangle([SLOT_X, y, SLOT_X + SLOT_W, y + SLOT_H], fill=(0, 0, 0, 0))
    return im


def build_thumb(frame):
    """Preview picker: lubang foto diisi abu-abu supaya kelihatan."""
    base = Image.new("RGBA", (CANVAS_W, CANVAS_H), "#e9e9e9")
    d = ImageDraw.Draw(base)
    for y in SLOT_YS:
        d.rectangle([SLOT_X, y, SLOT_X + SLOT_W, y + SLOT_H], fill="#9aa0a6")
    base.alpha_composite(frame)
    return base.resize((270, 480), Image.LANCZOS)


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    deco_dir, out_dir = sys.argv[1], sys.argv[2]
    sources = {}
    mpath = os.path.join(deco_dir, "manifest.json")
    if os.path.exists(mpath):
        sources = json.load(open(mpath, encoding="utf-8"))

    made = 0
    for theme in THEMES:
        deco_path = os.path.join(deco_dir, theme["deco"] + ".png")
        if not os.path.exists(deco_path):
            print(f"SKIP {theme['deco']}: dekorasi tidak ada")
            continue
        # nama folder = id template; pakai slug supaya unik & deskriptif
        slug = theme["deco"]
        slug_overrides = {"retro": "retro-film", "sports": "soccer", "music": "music-notes",
                          "kawaii": "kawaii-cute", "safari": "safari-jungle",
                          "starry": "starry-night", "summer": "summer-beach",
                          "floral": "floral-bloom", "neon": "neon-nights",
                          "gold": "gold-luxury", "galaxy": "outer-space",
                          "coffee": "coffee-time", "newyear": "new-year"}
        slug = slug_overrides.get(theme["deco"], slug)
        folder = os.path.join(out_dir, slug)
        os.makedirs(folder, exist_ok=True)

        deco = Image.open(deco_path).convert("RGBA")
        frame = build_frame(theme, deco)
        frame.save(os.path.join(folder, "frame.png"), optimize=True)
        build_thumb(frame).save(os.path.join(folder, "thumb.png"), optimize=True)

        cfg = {
            "name": theme["name"],
            "category": theme["category"],
            "keywords": theme["keywords"],
            "description": theme["description"],
            "canvas": {"width": CANVAS_W, "height": CANVAS_H},
            "background": theme["bg"],
            "photoSlots": [
                {"photoIndex": i, "x": SLOT_X, "y": y, "width": SLOT_W, "height": SLOT_H}
                for i, y in enumerate(SLOT_YS)
            ],
        }
        with open(os.path.join(folder, "template.json"), "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
            f.write("\n")

        src = sources.get(theme["deco"], {})
        print(f"OK  {slug:14s} <- {src.get('url', '?')}")
        made += 1
    print(f"\n{made} template dibuat di {out_dir}")


if __name__ == "__main__":
    main()
