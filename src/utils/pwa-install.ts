export type InstallPlatform = "android" | "ios" | "mac" | "other";
export type InstallFlowStage =
  | "idle"
  | "prompting"
  | "awaiting_install"
  | "instructions"
  | "success"
  | "network_error";

type WindowLike = Pick<Window, "matchMedia" | "navigator">;
type NavigatorLike = Pick<Navigator, "userAgent" | "vendor" | "platform" | "maxTouchPoints"> & {
  standalone?: boolean;
};

export const getInstallPlatform = (nav: NavigatorLike): InstallPlatform => {
  const ua = (nav.userAgent || nav.vendor || "").toLowerCase();
  const isIpadOsDesktop = nav.platform === "MacIntel" && (nav.maxTouchPoints || 0) > 1;

  if (isIpadOsDesktop || /iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  if (/macintosh|mac os x/.test(ua)) return "mac";
  return "other";
};

export const isRunningAsInstalledPwa = (win: WindowLike = window): boolean => {
  const nav = win.navigator as NavigatorLike;
  return win.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
};

export const shouldRouteOwnerToInstall = (win: WindowLike = window): boolean =>
  !isRunningAsInstalledPwa(win);

export const shouldAutostartInstall = (search: string): boolean => {
  const params = new URLSearchParams(search);
  return params.get("autostart") === "1";
};

export const getInstallEntryStage = (params: {
  platform: InstallPlatform;
  hasDeferredPrompt: boolean;
}): InstallFlowStage => {
  if (params.platform === "ios") return "instructions";
  if (params.platform === "android" && params.hasDeferredPrompt) return "prompting";
  return "instructions";
};

export const getAndroidStageAfterPromptChoice = (
  outcome: "accepted" | "dismissed",
): InstallFlowStage => (outcome === "accepted" ? "awaiting_install" : "instructions");

export const shouldShowOpenApp = (isInstalled: boolean): boolean => isInstalled;
