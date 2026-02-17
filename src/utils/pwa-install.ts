export const isRunningAsInstalledPwa = (): boolean =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

export const shouldRouteOwnerToInstall = (): boolean => !isRunningAsInstalledPwa();
