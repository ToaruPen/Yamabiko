import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { loadRuntimeConfig } from "../../../src/config/env.js";

describe("loadRuntimeConfig", () => {
  describe("WEBHOOK_SECRET", () => {
    it("throws ZodError when WEBHOOK_SECRET is missing", () => {
      expect(() =>
        loadRuntimeConfig({
          DATABASE_URL: "postgresql://test",
          HOST: "127.0.0.1",
          PORT: "3000",
          RUN_MODE: "dry-run",
        }),
      ).toThrow(ZodError);
    });

    it("throws ZodError when WEBHOOK_SECRET is empty string", () => {
      expect(() =>
        loadRuntimeConfig({
          DATABASE_URL: "postgresql://test",
          HOST: "127.0.0.1",
          PORT: "3000",
          RUN_MODE: "dry-run",
          WEBHOOK_SECRET: "",
        }),
      ).toThrow(ZodError);
    });

    it("returns webhookSecret when WEBHOOK_SECRET is provided", () => {
      const config = loadRuntimeConfig({
        DATABASE_URL: "postgresql://test",
        HOST: "127.0.0.1",
        PORT: "3000",
        RUN_MODE: "dry-run",
        WEBHOOK_SECRET: "test-secret-value",
      });

      expect(config.webhookSecret).toBe("test-secret-value");
    });
  });
});
