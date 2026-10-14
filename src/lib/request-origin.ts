/** Railway terminates TLS and preserves Host; Next's internal URL uses its listen address. */
export function publicRequestUrl(request: Request, trustedRailwayProxy = false) {
  if (!trustedRailwayProxy) return request.url;
  const host = request.headers.get("host"), protocol = request.headers.get("x-forwarded-proto");
  if (!host || !protocol) return request.url;
  if (!/^(http|https)$/.test(protocol) || /[\s,/@\\?#]/.test(host)) throw new Error("Invalid forwarded authority.");
  const authority = new URL(`${protocol}://${host}`);
  if (authority.username || authority.password || authority.pathname !== "/" || authority.search || authority.hash) throw new Error("Invalid forwarded authority.");
  const url = new URL(request.url);
  url.protocol = authority.protocol;
  url.hostname = authority.hostname;
  url.port = authority.port;
  return url.href;
}
