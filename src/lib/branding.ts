/**
 * White-label branding (CFO Suite). A client entity can carry its own logo,
 * accent color, and (where allowed) suppress the "Powered by Navi" mark on the
 * client portal and exported reports.
 *
 * Validation lives here so the API and any importer agree: logo must be an
 * https URL, color a 3/6-digit hex. Anything invalid is rejected, never
 * silently stored — a broken logo on a client-facing report is worse than none.
 */
export interface Branding {
  logoUrl: string | null
  color: string | null
  hideNaviioBranding: boolean
}

export const DEFAULT_BRANDING: Branding = { logoUrl: null, color: null, hideNaviioBranding: false }

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** Valid only for https image URLs (no http, no data: — those are XSS/exfil vectors on a public page). */
export function isValidLogoUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && url.length <= 2048
  } catch {
    return false
  }
}

export function isValidBrandColor(color: string): boolean {
  return HEX_RE.test(color)
}

/** Map a raw org row to a Branding object (null-safe). */
export function brandingFrom(org: {
  brandLogoUrl: string | null
  brandColor: string | null
  hideNaviioBranding: boolean
}): Branding {
  return { logoUrl: org.brandLogoUrl, color: org.brandColor, hideNaviioBranding: org.hideNaviioBranding }
}
