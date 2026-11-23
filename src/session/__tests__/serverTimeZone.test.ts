/** @jest-environment node */
import { DEFAULT_SERVERS } from "../../storage/registry/defaultServers";
import { normalizeServerUrl } from "../../storage/registryRules";
import { parseServerUrl } from "../serverUrl";
import { serverTimeZoneForUrl } from "../serverTimeZone";

describe("serverTimeZoneForUrl", () => {
  it("maps the HS and backup default servers", () => {
    expect(serverTimeZoneForUrl(DEFAULT_SERVERS[0].url)).toBe("Europe/Berlin");
    expect(serverTimeZoneForUrl(DEFAULT_SERVERS[1].url)).toBe("UTC");
  });

  it("normalizes a URL before lookup", () => {
    const parsed = parseServerUrl(`${DEFAULT_SERVERS[0].url}/`);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(serverTimeZoneForUrl(parsed.url)).toBe("Europe/Berlin");
    }
  });

  it("defaults unknown custom servers to UTC", () => {
    expect(
      serverTimeZoneForUrl(normalizeServerUrl("https://chat.example.de/chat")),
    ).toBe("UTC");
  });
});
