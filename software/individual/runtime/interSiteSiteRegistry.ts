import {
  MESSAGE_ID_PATTERN,
  SITE_ID_PATTERN,
  normalizePublicArtifactOrigin,
  type MultiLocationSiteConfig,
} from "./interSiteProtocol";

export class InterSiteSiteRegistry {
  private readonly sites = new Map<string, MultiLocationSiteConfig>();
  private readonly individualOwners = new Map<string, string>();

  constructor(private readonly maxSites: number) {
    if (!Number.isSafeInteger(maxSites) || maxSites < 1 || maxSites > 1_024) {
      throw new Error("maxSites must be an integer between 1 and 1024.");
    }
  }

  register(config: MultiLocationSiteConfig): void {
    if (
      typeof config !== "object" ||
      config === null ||
      Array.isArray(config) ||
      Object.keys(config).some(
        (key) => !["siteId", "siteName", "localIndividualIds", "artifactOrigin"].includes(key),
      )
    ) {
      throw new Error("Site configuration contains unsupported fields.");
    }
    if (typeof config.siteId !== "string" || !SITE_ID_PATTERN.test(config.siteId)) {
      throw new Error("Site ID is invalid.");
    }
    if (
      typeof config.siteName !== "string" ||
      !config.siteName.trim() ||
      config.siteName.length > 200 ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(config.siteName)
    ) {
      throw new Error("siteName is invalid.");
    }
    if (
      !Array.isArray(config.localIndividualIds) ||
      config.localIndividualIds.length > 256 ||
      config.localIndividualIds.some(
        (id) => typeof id !== "string" || !MESSAGE_ID_PATTERN.test(id),
      ) ||
      new Set(config.localIndividualIds).size !== config.localIndividualIds.length
    ) {
      throw new Error(`Site "${config.siteId}" has invalid or duplicate Individual IDs.`);
    }
    const normalized = Object.freeze<MultiLocationSiteConfig>({
      siteId: config.siteId,
      siteName: config.siteName.trim(),
      localIndividualIds: Object.freeze([...config.localIndividualIds].sort()),
      artifactOrigin: normalizePublicArtifactOrigin(config.artifactOrigin, "artifactOrigin"),
    });
    const existing = this.sites.get(config.siteId);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(normalized)) {
        throw new Error(`Site "${config.siteId}" is already registered with different trust metadata.`);
      }
      return;
    }
    if (this.sites.size >= this.maxSites) {
      throw new Error("Inter-site registry has reached its site capacity.");
    }
    for (const individualId of normalized.localIndividualIds) {
      const owner = this.individualOwners.get(individualId);
      if (owner !== undefined) {
        throw new Error(
          `Individual "${individualId}" is already owned by registered site "${owner}".`,
        );
      }
    }
    this.sites.set(config.siteId, normalized);
    for (const individualId of normalized.localIndividualIds) {
      this.individualOwners.set(individualId, normalized.siteId);
    }
  }

  require(siteId: string): MultiLocationSiteConfig {
    const site = this.sites.get(siteId);
    if (!site) throw new Error(`Site "${siteId}" is not registered.`);
    return site;
  }
}
