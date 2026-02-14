export type JwtPayload = {
  iss?: string;
  exp?: number;
  iat?: number;
  aud?: string | string[];
  [key: string]: unknown;
};

function base64UrlToBase64(input: string) {
  let str = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = str.length % 4;
  if (pad === 2) str += "==";
  else if (pad === 3) str += "=";
  else if (pad !== 0) {
    // pad===1 is invalid base64
    return null;
  }
  return str;
}

export function parseJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const b64 = base64UrlToBase64(parts[1]);
    if (!b64) return null;
    const json = atob(b64);
    const payload = JSON.parse(json);
    if (!payload || typeof payload !== "object") return null;
    return payload as JwtPayload;
  } catch {
    return null;
  }
}

export function expectedIssuer(supabaseUrl: string) {
  return `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`;
}

export function isIssuerMismatch(payloadIss: string | undefined, supabaseUrl: string) {
  if (!payloadIss) return true;
  return payloadIss !== expectedIssuer(supabaseUrl);
}

