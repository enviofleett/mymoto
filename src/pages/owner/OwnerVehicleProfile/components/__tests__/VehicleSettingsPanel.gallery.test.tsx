import { describe, it, expect } from "vitest";
import { validateVehiclePhotoFile } from "../VehicleSettingsPanel";

const createFile = (options: { type: string; sizeBytes: number }) => {
  const extension = options.type.split("/")[1] || "bin";
  const content = "x".repeat(options.sizeBytes);
  return new File([content], "test." + extension, {
    type: options.type,
    lastModified: Date.now(),
  });
};

describe("validateVehiclePhotoFile", () => {
  it("accepts valid jpeg image under size limit", () => {
    const file = createFile({ type: "image/jpeg", sizeBytes: 1024 * 1024 });
    const result = validateVehiclePhotoFile(file);
    expect(result).toBeNull();
  });

  it("rejects non-image file types", () => {
    const file = createFile({ type: "application/pdf", sizeBytes: 1024 });
    const result = validateVehiclePhotoFile(file);
    expect(result).toBe("Only image files are allowed");
  });

  it("rejects unsupported image mime types", () => {
    const file = createFile({ type: "image/svg+xml", sizeBytes: 1024 });
    const result = validateVehiclePhotoFile(file);
    expect(result).toBe("Only JPG, PNG, WEBP, or GIF images are allowed");
  });

  it("rejects images over 5MB", () => {
    const file = createFile({ type: "image/png", sizeBytes: 3 * 1024 * 1024 });
    const result = validateVehiclePhotoFile(file);
    expect(result).toBe("Images must be under 2MB");
  });
});
