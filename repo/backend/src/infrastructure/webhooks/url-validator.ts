import { resolve4, resolve6 } from 'dns/promises';

/**
 * Webhook URL SSRF validator with optional allowlist/CIDR policy.
 *
 * When WEBHOOK_ALLOWED_DESTINATIONS is set (comma-separated), only URLs
 * matching an allowed domain or CIDR pass validation. When unset, all
 * destinations are permitted except cloud metadata targets.
 *
 * Blocklist (always enforced):
 *   - Entire link-local CIDR 169.254.0.0/16 (cloud metadata for AWS/GCP/Azure)
 *   - AWS IPv6 metadata fd00:ec2::254
 *   - Known metadata hostnames (metadata.google.internal, metadata.goog)
 *
 * Performs DNS resolution on hostnames to prevent rebinding attacks.
 *
 * Private/LAN addresses (10.x, 172.16-31.x, 192.168.x, localhost) are
 * permitted for on-prem deployments unless an allowlist restricts them.
 */

const BLOCKED_METADATA_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata.goog',
]);

// --- IPv4 CIDR helpers ---

function parseIpv4(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (const part of parts) {
    const n = parseInt(part, 10);
    if (isNaN(n) || n < 0 || n > 255) return null;
    num = (num << 8) | n;
  }
  return num >>> 0;
}

function ipInCidr(ip: string, cidr: string): boolean {
  const slash = cidr.indexOf('/');
  if (slash === -1) return ip === cidr;
  const cidrIp = cidr.slice(0, slash);
  const bits = parseInt(cidr.slice(slash + 1), 10);
  const ipNum = parseIpv4(ip);
  const cidrNum = parseIpv4(cidrIp);
  if (ipNum === null || cidrNum === null || isNaN(bits)) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipNum & mask) === (cidrNum & mask);
}

// --- Domain matching ---

function domainMatches(hostname: string, pattern: string): boolean {
  const lowerPattern = pattern.toLowerCase();
  if (lowerPattern.startsWith('*.')) {
    const suffix = lowerPattern.slice(1); // e.g. ".example.com"
    return hostname.endsWith(suffix) || hostname === lowerPattern.slice(2);
  }
  return hostname === lowerPattern;
}

// --- Allowlist parsing ---

function parseAllowlist(): { cidrs: string[]; domains: string[] } | null {
  const raw = process.env.WEBHOOK_ALLOWED_DESTINATIONS;
  if (!raw || raw.trim() === '') return null;

  const cidrs: string[] = [];
  const domains: string[] = [];

  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (/^[\d.]+\/\d+$/.test(trimmed) || /^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed)) {
      cidrs.push(trimmed);
    } else {
      domains.push(trimmed);
    }
  }
  return (cidrs.length > 0 || domains.length > 0) ? { cidrs, domains } : null;
}

// --- Core blocklist ---

function isBlockedIp(ip: string): boolean {
  if (ip.startsWith('169.254.')) return true;
  if (ip.toLowerCase() === 'fd00:ec2::254') return true;
  return false;
}

function isIpAddress(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
}

// --- Resolve hostname IPs ---

async function resolveIps(hostname: string): Promise<string[]> {
  const results = await Promise.allSettled([
    resolve4(hostname),
    resolve6(hostname),
  ]);
  const ips: string[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') ips.push(...r.value);
  }
  return ips;
}

// --- Main validator ---

export async function assertWebhookUrlSafe(urlStr: string): Promise<void> {
  const url = new URL(urlStr);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Webhook URL must use http or https scheme');
  }

  const hostname = url.hostname.toLowerCase();

  // Always block known metadata hostnames
  if (BLOCKED_METADATA_HOSTNAMES.has(hostname)) {
    throw new Error('Webhook URL targets a blocked cloud metadata hostname');
  }

  const allowlist = parseAllowlist();

  if (isIpAddress(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new Error('Webhook URL targets a blocked IP in the link-local range (169.254.0.0/16)');
    }
    if (allowlist && !allowlist.cidrs.some((cidr) => ipInCidr(hostname, cidr))) {
      throw new Error('Webhook URL IP is not in the allowed destinations list');
    }
    return;
  }

  // Hostname-based URL: check domain allowlist first
  if (allowlist) {
    const domainAllowed = allowlist.domains.some((d) => domainMatches(hostname, d));
    if (!domainAllowed) {
      // Resolve and check against CIDR allowlist
      const ips = await resolveIps(hostname);
      const blocked = ips.find(isBlockedIp);
      if (blocked) {
        throw new Error(`Webhook URL hostname resolves to blocked IP ${blocked}`);
      }
      const cidrAllowed = ips.length > 0 && ips.every((ip) => allowlist.cidrs.some((cidr) => ipInCidr(ip, cidr)));
      if (!cidrAllowed) {
        throw new Error('Webhook URL hostname is not in the allowed destinations list');
      }
    }
    return;
  }

  // No allowlist — just enforce blocklist via DNS resolution
  const ips = await resolveIps(hostname);
  const blocked = ips.find(isBlockedIp);
  if (blocked) {
    throw new Error(`Webhook URL hostname resolves to blocked IP ${blocked}`);
  }
}
