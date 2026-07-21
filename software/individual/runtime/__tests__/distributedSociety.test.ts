import { describe, expect, it } from "vitest";
import { MultiLocationBridge } from "../multiLocationBridge";
import { MigrationProtocol } from "../migrationProtocol";
import { createTemplateManifest } from "../../core/template/manifest";
import { createInitialState } from "../../core/createInitialState";

describe("Multi-Location Bridge & Migration (Milestones 4.2 & 4.3)", () => {
  it("bridges multi-location sites and enforces outage isolation on link drop", () => {
    const bridge = new MultiLocationBridge();
    bridge.registerSite({ siteId: "london", siteName: "Tate Modern", localIndividualIds: ["iris"] });
    bridge.registerSite({ siteId: "tokyo", siteName: "Mori Art Museum", localIndividualIds: ["morrow"] });

    // Connect link between London and Tokyo
    bridge.connectLink("london", "tokyo");
    expect(bridge.isLinkConnected("london", "tokyo")).toBe(true);

    // Send inter-site message
    const sent = bridge.sendInterSiteMessage({
      messageId: "msg-1",
      sourceSiteId: "london",
      destinationSiteId: "tokyo",
      timestamp: "2026-01-01T00:00:00Z",
      payloadType: "portrait_share",
    });
    expect(sent).toBe(true);

    // Simulate link outage
    bridge.disconnectLink("london", "tokyo");
    expect(bridge.isLinkConnected("london", "tokyo")).toBe(false);

    // Further inter-site message is rejected during outage without corrupting local site
    const sentDuringOutage = bridge.sendInterSiteMessage({
      messageId: "msg-2",
      sourceSiteId: "london",
      destinationSiteId: "tokyo",
      timestamp: "2026-01-01T00:01:00Z",
      payloadType: "portrait_share",
    });
    expect(sentDuringOutage).toBe(false);
  });

  it("exports and imports identity migration bundles between venue sites", () => {
    const manifest = createTemplateManifest({ id: "iris", displayName: "Iris" });
    const state = createInitialState(manifest, "2026-01-01T00:00:00Z");

    const bundle = MigrationProtocol.exportBundle({
      snapshot: { manifest, state },
      memories: [],
      sourceSiteId: "london",
      destinationSiteId: "venice",
    });

    expect(bundle.individualId).toBe("iris");
    expect(bundle.sourceSiteId).toBe("london");
    expect(bundle.destinationSiteId).toBe("venice");

    const imported = MigrationProtocol.importBundle(bundle, "venice");
    expect(imported.snapshot.state.selfConcept.narrative).toContain("Migrated from london to venice");
    expect(imported.memories).toHaveLength(1);
    expect(imported.memories[0].content).toContain("Migrated identity handoff");
  });
});
