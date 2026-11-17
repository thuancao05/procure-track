import crypto from 'crypto';
import { google } from 'googleapis';
import { createAdminClient } from './supabase';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
];

const TOKEN_VERSION = 'v1';

function googleOAuthConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  };
}

export function createGoogleOAuthClient() {
  const { clientId, clientSecret, redirectUri } = googleOAuthConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Chưa cấu hình GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI.');
  }
  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  // Cloudflare Workers does not always transparently decompress gzip responses
  // returned by Google's OAuth endpoint. Ask Google for plain JSON so
  // google-auth-library does not receive a binary string instead of an object.
  const originalRequest = client.transporter.request.bind(client.transporter);
  client.transporter.request = async (options) => {
    const headers = new Headers(options.headers ?? {});
    headers.set('Accept-Encoding', 'identity');

    const response = await originalRequest({
      ...options,
      headers,
    });

    // Workers' fetch adapter may leave JSON responses as strings. The OAuth2
    // client expects an object and mutates it with expiry/refresh metadata.
    if (typeof response?.data === 'string') {
      try {
        response.data = JSON.parse(response.data);
      } catch {
        // Leave non-JSON responses untouched so the original error is kept.
      }
    }

    return response;
  };

  return client;
}

function encryptionKey() {
  const value = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!value) throw new Error('Chưa cấu hình GOOGLE_TOKEN_ENCRYPTION_KEY.');
  return crypto.createHash('sha256').update(value).digest();
}

export function encryptRefreshToken(refreshToken) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(refreshToken, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [TOKEN_VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(':');
}

function decryptRefreshToken(value) {
  const [version, ivText, tagText, ciphertextText] = String(value).split(':');
  if (version !== TOKEN_VERSION || !ivText || !tagText || !ciphertextText) throw new Error('Refresh token đã mã hóa không hợp lệ.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, 'base64url')), decipher.final()]).toString('utf8');
}

export async function getStoredGoogleConnection() {
  const { data, error } = await createAdminClient()
    .from('google_oauth_connections')
    .select('refresh_token_ciphertext, connected_at, updated_at, disabled')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function saveGoogleRefreshToken(refreshToken) {
  const { error } = await createAdminClient().from('google_oauth_connections').upsert({
    id: 1,
    refresh_token_ciphertext: encryptRefreshToken(refreshToken),
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    disabled: false,
  });
  if (error) throw error;
}

export async function disableGoogleConnection() {
  const { error } = await createAdminClient().from('google_oauth_connections').upsert({
    id: 1,
    refresh_token_ciphertext: null,
    updated_at: new Date().toISOString(),
    disabled: true,
  });
  if (error) throw error;
}

export async function getGoogleOAuth2Client() {
  const connection = await getStoredGoogleConnection();
  const localRefreshToken = process.env.NODE_ENV !== 'production'
    ? process.env.GOOGLE_REFRESH_TOKEN
    : null;
  const refreshToken = localRefreshToken || (connection?.disabled
    ? null
    : connection?.refresh_token_ciphertext
      ? decryptRefreshToken(connection.refresh_token_ciphertext)
      : process.env.GOOGLE_REFRESH_TOKEN);
  if (!refreshToken) throw new Error('Chưa kết nối tài khoản Google. Admin cần kết nối Google trước.');

  const client = createGoogleOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}
