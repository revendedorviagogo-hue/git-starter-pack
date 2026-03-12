/** Domains that should be ignored (preview / dev environments) */
const IGNORED_DOMAINS = [
  "localhost",
  "127.0.0.1",
  "lovable.app",
  "lovableproject.com",
  "lovable.dev",
];

/**
 * Full-hostname overrides: maps an exact hostname to a "subdomain" key
 * so SubdomainRouter can resolve it to the right page component.
 */
const HOSTNAME_OVERRIDES: Record<string, string> = {
  "cocos.actualizar.org": "cocos",
  "paysera.actualizar.org": "paysera",
  "plus.actualizarcocos.com": "plus",
};

/**
 * Returns the subdomain of the current hostname, or null if none detected
 * or if running in a dev/preview environment.
 */
export const getSubdomain = (): string | null => {
  const hostname = window.location.hostname;

  // Check full-hostname overrides first
  const override = HOSTNAME_OVERRIDES[hostname];
  if (override) return override;

  // Skip dev / preview environments
  const isIgnored = IGNORED_DOMAINS.some(
    (d) => hostname === d || hostname.endsWith(`.${d}`)
  );
  if (isIgnored) return null;

  const parts = hostname.split(".");
  if (parts.length < 3) return null;

  return parts[0].toLowerCase();
};
