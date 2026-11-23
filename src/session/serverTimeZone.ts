import { DEFAULT_SERVERS } from "../storage/registry/defaultServers";
import { normalizeServerUrl } from "../storage/registryRules";
import type { ServerTimeZone } from "../messaging/serverTime";

const SERVER_TIME_ZONES: ReadonlyMap<string, ServerTimeZone> = new Map([
  [normalizeServerUrl(DEFAULT_SERVERS[0].url), "Europe/Berlin"],
  [normalizeServerUrl(DEFAULT_SERVERS[1].url), "UTC"],
]);

export function serverTimeZoneForUrl(url: string): ServerTimeZone {
  const normalized = normalizeServerUrl(url);
  return SERVER_TIME_ZONES.get(normalized) ?? "UTC";
  // Change the backup entry when the backup server's time zone is adjusted.
}
