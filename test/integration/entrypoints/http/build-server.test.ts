import { afterEach, describe, expect, it } from "vitest";

import { createTestServer } from "../../../helpers/create-test-server.js";

describe("buildServer", () => {
  const servers = new Set<ReturnType<typeof createTestServer>["server"]>();

  afterEach(async () => {
    await Promise.all(
      [...servers].map(async (server) => {
        await server.close();
      }),
    );
    servers.clear();
  });

  it("exposes a health endpoint", async () => {
    const { server } = createTestServer();

    servers.add(server);

    const response = await server.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      runMode: "dry-run",
      service: "yamabiko",
      status: "ok",
    });
  });
});
