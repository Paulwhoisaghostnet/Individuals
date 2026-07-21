import type { IndividualSnapshot, Portrait } from "../core/model";

export interface MultiLocationSiteConfig {
  readonly siteId: string;
  readonly siteName: string;
  readonly localIndividualIds: readonly string[];
}

export interface InterSiteMessage {
  readonly messageId: string;
  readonly sourceSiteId: string;
  readonly destinationSiteId: string;
  readonly timestamp: string;
  readonly payloadType: "portrait_share" | "identity_sync";
  readonly portrait?: Portrait;
  readonly snapshot?: IndividualSnapshot;
}

export class MultiLocationBridge {
  private readonly sites = new Map<string, MultiLocationSiteConfig>();
  private readonly connectedLinks = new Set<string>();
  private readonly messageQueue: InterSiteMessage[] = [];

  registerSite(config: MultiLocationSiteConfig): void {
    this.sites.set(config.siteId, config);
  }

  connectLink(siteIdA: string, siteIdB: string): void {
    const linkKey = this.linkKey(siteIdA, siteIdB);
    this.connectedLinks.add(linkKey);
  }

  disconnectLink(siteIdA: string, siteIdB: string): void {
    const linkKey = this.linkKey(siteIdA, siteIdB);
    this.connectedLinks.delete(linkKey);
  }

  isLinkConnected(siteIdA: string, siteIdB: string): boolean {
    return this.connectedLinks.has(this.linkKey(siteIdA, siteIdB));
  }

  sendInterSiteMessage(msg: InterSiteMessage): boolean {
    if (!this.isLinkConnected(msg.sourceSiteId, msg.destinationSiteId)) {
      // Outage isolation: Link is disconnected. Message is rejected cleanly without corrupting site state.
      return false;
    }
    this.messageQueue.push(msg);
    return true;
  }

  receiveMessagesForSite(siteId: string): readonly InterSiteMessage[] {
    const siteMsgs = this.messageQueue.filter((m) => m.destinationSiteId === siteId);
    return siteMsgs;
  }

  private linkKey(siteA: string, siteB: string): string {
    return [siteA, siteB].sort().join("<->");
  }
}
