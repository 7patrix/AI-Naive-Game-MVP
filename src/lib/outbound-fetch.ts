import { ProxyAgent, setGlobalDispatcher } from "undici";
import { env } from "./env";

let proxyConfigured = false;

function configureProxy() {
  if (proxyConfigured) {
    return;
  }

  proxyConfigured = true;

  if (env.OUTBOUND_PROXY_URL) {
    setGlobalDispatcher(new ProxyAgent(env.OUTBOUND_PROXY_URL));
  }
}

export function outboundFetch(input: RequestInfo | URL, init?: RequestInit) {
  configureProxy();
  return fetch(input, init);
}
