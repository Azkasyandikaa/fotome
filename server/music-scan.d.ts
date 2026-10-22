export interface MusicTrackEntry {
  src: string;
  file: string;
  title: string;
}

export interface MusicManifest {
  autoplay: boolean;
  tracks: MusicTrackEntry[];
}

export function scanMusic(publicDir: string): MusicManifest;
