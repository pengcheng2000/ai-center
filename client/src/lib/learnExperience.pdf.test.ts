import { describe, expect, it } from "vitest";
import { defaultPdfDisplayMode, pdfReadingProfile } from "./learnExperience";

describe("PDF reading strategy", () => {
  it("detects wide first pages as presentations", () => {
    expect(pdfReadingProfile(1280, 720)).toBe("presentation");
    expect(pdfReadingProfile(612, 792)).toBe("document");
  });

  it("defaults presentations and long PDFs to single-page mode", () => {
    expect(defaultPdfDisplayMode(8, "presentation")).toBe("page");
    expect(defaultPdfDisplayMode(12, "document")).toBe("page");
    expect(defaultPdfDisplayMode(11, "document")).toBe("scroll");
  });
});
