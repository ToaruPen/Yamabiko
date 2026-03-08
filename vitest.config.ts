import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    reporters: ["default"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: ["text", "json-summary", "html"],
      include: [
        "src/domain/**/*.ts",
        "src/application/**/*.ts",
        "src/workers/**/*.ts",
        "src/contracts/**/*.ts",
        "src/config/**/*.ts",
      ],
      exclude: [
        "src/**/index.ts",
        "src/**/*.d.ts",
        "src/application/ports/**",
        "src/domain/deliveries/**",
        "src/domain/review-events/review-feedback-event.ts",
      ],
    },
  },
});
