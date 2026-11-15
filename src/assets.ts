/** Resolve logical public paths at render time, keeping saved study snapshots portable. */
export function publicAssetUrl(path: string, base = import.meta.env.BASE_URL): string {
  // Data/blob fixtures and absolute URLs are not app-root public paths.
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  const prefix = `${base.replace(/\/+$/, '')}/`;
  if (prefix === '/' || path.startsWith(prefix)) return path;
  return `${prefix}${path.slice(1)}`;
}
