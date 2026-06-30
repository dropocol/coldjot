/**
 * Extract the client IP from a request, parsing x-forwarded-for correctly.
 *
 * `x-forwarded-for` is a comma-separated chain where the FIRST hop is the
 * original client; subsequent entries are proxies. The whole raw value must
 * never be trusted or passed downstream — previously the entire string (which
 * can be spoofed by the client) was used as the "IP".
 *
 * Even the first hop is only trustworthy if a known proxy in front of us
 * appended it. Treat the result as best-effort.
 */
export function getClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first && isValidIp(first)) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp && isValidIp(realIp.trim())) return realIp.trim();
  return null;
}

function isValidIp(s: string): boolean {
  // IPv4: four dot-separated octets 0–255
  const v4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (v4.test(s)) {
    return s.split(".").every((octet) => {
      const n = Number(octet);
      return n >= 0 && n <= 255;
    });
  }
  // IPv6: crude check (contains ':' and only hex/colons/dots)
  if (s.includes(":") && /^[0-9a-fA-F:.]+$/.test(s)) return true;
  return false;
}
