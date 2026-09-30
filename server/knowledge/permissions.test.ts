import { describe, expect, it } from "vitest";
import { isLocalDevelopmentPreview } from "./permissions";

describe("Knowledge development preview boundary", () => {
  it("accepts only socket loopback addresses in development", () => {
    for (const address of ["127.0.0.1", "::1", "::ffff:127.0.0.1"])
      expect(isLocalDevelopmentPreview(address, "development")).toBe(true);
    for (const address of ["192.168.1.20", "10.0.0.8", "", undefined])
      expect(isLocalDevelopmentPreview(address, "development")).toBe(false);
  });

  it("never enables the preview in production, including on localhost", () => {
    expect(isLocalDevelopmentPreview("127.0.0.1", "production")).toBe(false);
  });
});
