// Unofficial Google favicon endpoint — last-resort visual identity when no
// logo_uri came through OAuth registration or CIMD. Defaults to a globe icon
// for unknown hosts.
export function synthesizeFaviconUrl(host: string): string {
  // Encode defensively in case a caller skips safeHostname.
  const target = encodeURIComponent(`https://${host}`);
  return `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${target}&size=64`;
}
