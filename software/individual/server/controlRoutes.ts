import type * as http from "node:http";

import { RuntimeControlError } from "../runtime/errors";
import type { SocietyApiDto } from "../runtime/publicProjection";
import type { SocietyRuntime } from "../runtime/societyRuntime";
import { ControlSecurity } from "./controlSecurity";
import {
  ApiRequestError,
  assertExactKeys,
  readJsonBody,
  securityHeaders,
  sendError,
  sendJson,
} from "./httpResponses";

export class ControlRoutes {
  constructor(
    private readonly runtime: SocietyRuntime,
    private readonly security: ControlSecurity,
    private readonly societyDto: () => Promise<SocietyApiDto>,
  ) {}

  async handle(
    pathname: string,
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ): Promise<void> {
    if (request.method === "OPTIONS") {
      const origin = this.security.requireOrigin(request);
      securityHeaders(response);
      response.writeHead(204, this.security.corsHeaders(origin));
      response.end();
      return;
    }
    if (request.method !== "POST") {
      sendError(response, 405, "method_not_allowed", "Only POST is supported.");
      return;
    }
    const origin = this.security.authorize(request);
    const body = await readJsonBody(request);
    if (pathname === "/api/v1/controls/pause" || pathname === "/api/v1/controls/resume") {
      await this.pauseOrResume(pathname, body);
    } else if (pathname === "/api/v1/controls/perception") {
      await this.perception(body);
    } else {
      throw new ApiRequestError(404, "not_found", "Control route was not found.");
    }
    const snapshot = await this.societyDto();
    sendJson(
      response,
      200,
      { accepted: true, revision: snapshot.revision, snapshot },
      this.security.corsHeaders(origin),
    );
  }

  private async pauseOrResume(pathname: string, body: Record<string, unknown>): Promise<void> {
    assertExactKeys(body, ["individualId"]);
    if (body.individualId !== undefined && typeof body.individualId !== "string") {
      throw new ApiRequestError(400, "invalid_individual_id", "individualId must be a string.");
    }
    const individualId = body.individualId as string | undefined;
    if (pathname.endsWith("/pause")) {
      individualId ? this.runtime.pause(individualId) : this.runtime.pauseAll();
    } else {
      individualId ? this.runtime.resume(individualId) : this.runtime.resumeAll();
    }
  }

  private async perception(body: Record<string, unknown>): Promise<void> {
    try {
      if (body.updates !== undefined) {
        assertExactKeys(body, ["updates"]);
        if (!Array.isArray(body.updates)) {
          throw new ApiRequestError(400, "invalid_tuning", "updates must be an array.");
        }
        const updates = body.updates.map((rawUpdate, index) => {
          if (typeof rawUpdate !== "object" || rawUpdate === null || Array.isArray(rawUpdate)) {
            throw new ApiRequestError(400, "invalid_tuning", `updates[${index}] must be an object.`);
          }
          const update = rawUpdate as Record<string, unknown>;
          assertExactKeys(update, ["individualId", "tuning"]);
          if (typeof update.individualId !== "string") {
            throw new ApiRequestError(400, "invalid_individual_id", `updates[${index}].individualId is required.`);
          }
          if (typeof update.tuning !== "object" || update.tuning === null || Array.isArray(update.tuning)) {
            throw new ApiRequestError(400, "invalid_tuning", `updates[${index}].tuning must be an object.`);
          }
          return {
            individualId: update.individualId,
            tuning: update.tuning as Readonly<Record<string, number>>,
          };
        });
        await this.runtime.tunePerceptions(updates);
        return;
      }
      assertExactKeys(body, ["individualId", "tuning"]);
      if (typeof body.individualId !== "string") {
        throw new ApiRequestError(400, "invalid_individual_id", "individualId is required.");
      }
      if (typeof body.tuning !== "object" || body.tuning === null || Array.isArray(body.tuning)) {
        throw new ApiRequestError(400, "invalid_tuning", "tuning must be a JSON object.");
      }
      await this.runtime.tunePerception(
        body.individualId,
        body.tuning as Readonly<Record<string, number>>,
      );
    } catch (error) {
      if (error instanceof ApiRequestError || error instanceof RuntimeControlError) throw error;
      throw new ApiRequestError(
        503,
        "control_persistence_failed",
        "Perception tuning could not be persisted.",
        true,
      );
    }
  }
}
