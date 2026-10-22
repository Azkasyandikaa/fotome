/**
 * Google Drive upload (REST, tanpa dependency tambahan).
 * - Service account: JSON key + scope drive.file, upload multipart ke folder target.
 * - Kalau belum dikonfigurasi, upload otomatis nonaktif dan galeri tetap jalan
 *   dari cache lokal server (foto terakhir tetap tampil di galeri publik).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,size';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

let cachedKey: ServiceAccount | null = null;
let cachedKeyPath: string | null = null;

function loadServiceAccount(): ServiceAccount | null {
  const file = process.env.GDRIVE_SERVICE_ACCOUNT_FILE ?? 'gdrive-service-account.json';
  if (cachedKey && cachedKeyPath === file) return cachedKey;
  try {
    const raw = fs.readFileSync(path.resolve(file), 'utf8');
    const json = JSON.parse(raw) as ServiceAccount;
    if (!json.client_email || !json.private_key) return null;
    cachedKey = json;
    cachedKeyPath = file;
    return json;
  } catch {
    return null;
  }
}

export function driveConfigured(): boolean {
  return loadServiceAccount() !== null;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

async function getAccessToken(): Promise<string | null> {
  const sa = loadServiceAccount();
  if (!sa) return null;
  const iat = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat,
      exp: iat + 3600,
    }),
  );
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(`${header}.${payload}`)
    .sign(sa.private_key.replace(/\\n/g, '\n'))
    .toString('base64url');
  const assertion = `${header}.${payload}.${signature}`;
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

export interface DriveUploadResult {
  id: string;
  name: string;
  webViewLink: string;
  size?: number;
}

/**
 * Upload satu file ke Google Drive (folder target jika GDRIVE_FOLDER_ID diset).
 * Teruskan progress lewat onProgress (0..1) kalau pembacaan file dilakukan perlahan.
 */
export async function uploadToDrive(
  filePath: string,
  filename: string,
  mimeType: string,
): Promise<DriveUploadResult | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const meta: Record<string, unknown> = { name: filename };
  const folder = process.env.GDRIVE_FOLDER_ID;
  if (folder && folder.trim()) meta.parents = [folder.trim()];

  const boundary = 'fmbooth' + crypto.randomBytes(12).toString('hex');
  const fileStream = fs.createReadStream(filePath);

  const parts: Uint8Array[] = [];
  const enc = new TextEncoder();
  parts.push(
    enc.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
        `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
  );

  const tail = enc.encode(`\r\n--${boundary}--\r\n`);

  const body = await new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = [];
    fileStream.on('data', (c: Buffer) => chunks.push(c));
    fileStream.on('error', reject);
    fileStream.on('end', () => {
      resolve(concat([...parts.map(bufLike), ...chunks, tail] as Uint8Array[]));
    });
  });

  try {
    const res = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: body as unknown as BodyInit,
    });
    if (!res.ok) {
      console.warn('[gdrive] upload failed:', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = (await res.json()) as DriveUploadResult;
    return data;
  } catch (err) {
    console.warn('[gdrive] upload error:', err);
    return null;
  }
}

function bufLike(b: Uint8Array): Uint8Array {
  return b;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
