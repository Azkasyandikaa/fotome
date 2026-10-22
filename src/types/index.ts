/** ---- Shared application types ---- */

export interface TemplatePhotoSlot {
  /** Which session photo (0–4) goes in this slot — frame bisa punya 1–5 slot. */
  photoIndex: 0 | 1 | 2 | 3 | 4;
  x: number;
  y: number;
  width: number;
  height: number;
  /** "cover" fills and crops, "contain" letterboxes. Default: cover. */
  fit?: 'cover' | 'contain';
  /** Rotasi foto di dalam slot (derajat, positif = searah jarum jam). Menimpa `engine.photoStyle`. */
  rotation?: number;
  /** Perbesaran foto di dalam slot (1 = pas). Menimpa `engine.photoStyle`. */
  scale?: number;
}

/** Gaya foto bawaan satu frame — berlaku untuk semua slot kecuali slot menimpa. */
export interface TemplatePhotoStyle {
  /** Rotasi foto di dalam slot (derajat). */
  rotation?: number;
  /** Zoom foto di dalam slot (1 = pas, >1 lebih dekat). */
  scale?: number;
}

/** Decorative element baked into the template, placed below the overlay. */
export interface TemplateDecal {
  type: 'text';
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  font: string;
  align?: 'left' | 'center' | 'right';
}

/** Full declarative template engine spec — developer-authored, data-driven. */
export interface TemplateEngine {
  canvas: { width: number; height: number };
  /** CSS color or path/URL to an image that fills the canvas. */
  background: string;
  photoSlots: TemplatePhotoSlot[];
  /** PNG/SVG drawn on top of the photos (frame, borders, decorations). */
  overlay?: string;
  decals?: TemplateDecal[];
  /**
   * Settingan foto bawaan frame (rotasi & ukuran). Setiap beda frame beda
   * hasilnya — UI menampilkan settingan ini di halaman pilih frame.
   */
  photoStyle?: TemplatePhotoStyle;
}

/** Entry in src/data/templates.json */
export interface TemplateDef {
  id: string;
  name: string;
  /** Kategori utama (dipakai untuk label). */
  category: string;
  /**
   * Semua kategori frame — frame bisa dimasukkan ke beberapa kategori
   * sekaligus lewat centang di halaman developer, dan muncul di semuanya.
   */
  categories: string[];
  /** Small preview image shown in the picker (thumb, not full-size). */
  thumb: string;
  keywords: string[];
  description: string;
  enabled: boolean;
  engine: TemplateEngine;
}

/** Entry in src/data/stickers.json */
export interface StickerDef {
  id: string;
  name: string;
  image: string;
  category: string;
  enabled: boolean;
}

/** Entry in src/data/filters.json (or a drop-in /public/booth/filters/<name>/). */
export interface FilterDef {
  id: string;
  name: string;
  /** CSS filter string applied to video preview and photo capture. */
  css: string;
  /** Drop-in overlay drawn on the video preview AND baked into captured photos. */
  overlay?: string;
  /** How the overlay covers the frame. Default: cover. */
  fit?: 'cover' | 'contain';
  /** Optional custom chip image; defaults to the overlay itself. */
  thumb?: string;
}

/** Entry in src/data/site.json */
export interface SiteConfig {
  title: string;
  tagline: string;
  description: string;
  developer: {
    name: string;
    bio: string;
    avatar: string;
    tech: string[];
    links: { label: string; url: string }[];
  };
  donation: {
    enabled: boolean;
    note: string;
    qrImage: string;
    methods: { name: string; account: string }[];
  };
  /** Ajakan "kirim fotonya ke admin" setelah unduhan berhasil. */
  admin: {
    enabled: boolean;
    prompt: string;
    buttonLabel: string;
    /** Pesan yang sudah terisi di chat user saat tombol ditekan. */
    message: string;
    /** Link chat admin (wa.me / WhatsApp / error lain). Kosong = tombol disembunyikan. */
    chatUrl: string;
  };
}

export interface PhotoLayer {
  kind: 'photo';
  slotIndex: number;
  photoIndex: 0 | 1 | 2 | 3 | 4;
  bitmap: ImageBitmap;
}

/**
 * Transformasi foto milik user di dalam lubang slot (dibuat di editor:
 * seret sudut untuk zoom, seret badan foto untuk geser, knob untuk muter).
 * Default (tanpa entry) = pas seperti settingan frame.
 */
export interface PhotoTransform {
  /** Zoom foto di dalam slot (1 = pas, >1 lebih besar). */
  scale: number;
  /** Rotasi foto dalam lubang (radian). */
  rotation: number;
  /** Geseran horizontal/vertikal dari pusat slot (px kanvas). */
  dx: number;
  dy: number;
}

export interface StickerLayer {
  kind: 'sticker';
  id: string;
  image: HTMLImageElement;
}

export interface EmojiLayer {
  kind: 'emoji';
  char: string;
}

/** Freehand pen stroke, normalized points + style in `data`. */
export interface InkLayer {
  kind: 'ink';
  data: {
    points: { x: number; y: number }[];
    color: string;
    width: number;
  };
}

interface LayerBase {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  /**
   * Posisi layer terhadap frame template: true = digambar DI ATAS frame,
   * false = DI BELAKANG frame (foto tetap di bawah keduanya). Default: atas.
   */
  overFrame?: boolean;
}

export type Layer = LayerBase & (PhotoLayer | StickerLayer | EmojiLayer | InkLayer);

export interface Session {
  id: string;
  templateId: string;
  filterId: string;
  photos: ImageBitmap[];
}

/** Undo/redo snapshots for the editor. */
export interface EditorSnapshot {
  layers: Layer[];
  activeIndex: number;
}
