import { describe, expect, it } from "vitest";
import {
  getAndroidStageAfterPromptChoice,
  getInstallEntryStage,
  getInstallPlatform,
  isRunningAsInstalledPwa,
  shouldAutostartInstall,
  shouldShowOpenApp,
} from "@/utils/pwa-install";

describe("pwa install logic", () => {
  it("shows Open app only when install is confirmed", () => {
    expect(shouldShowOpenApp(false)).toBe(false);
    expect(shouldShowOpenApp(true)).toBe(true);
  });

  it("android dismissed prompt never maps to success", () => {
    expect(getAndroidStageAfterPromptChoice("dismissed")).toBe("instructions");
  });

  it("android accepted prompt waits for install confirmation", () => {
    expect(getAndroidStageAfterPromptChoice("accepted")).toBe("awaiting_install");
  });

  it("ios defaults to manual install instructions", () => {
    expect(getInstallEntryStage({ platform: "ios", hasDeferredPrompt: false })).toBe("instructions");
  });

  it("autostart=1 enables one-time install autostart trigger", () => {
    expect(shouldAutostartInstall("?autostart=1")).toBe(true);
    expect(shouldAutostartInstall("?autostart=0")).toBe(false);
  });

  it("detects iPadOS desktop user agent as ios", () => {
    expect(
      getInstallPlatform({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
        vendor: "Apple Computer, Inc.",
        platform: "MacIntel",
        maxTouchPoints: 5,
      }),
    ).toBe("ios");
  });

  it("detects installed mode using standalone media query", () => {
    const mockWindow = {
      matchMedia: () => ({ matches: true } as MediaQueryList),
      navigator: { standalone: false },
    } as unknown as Window;
    expect(isRunningAsInstalledPwa(mockWindow)).toBe(true);
  });
});
