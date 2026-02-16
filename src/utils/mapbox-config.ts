function readOverride(key: string): string | undefined {
  const value = (globalThis as any)?.[key];
  return typeof value === "string" ? value : undefined;
}

export function getMapboxAccessToken(): string | undefined {
  const override = readOverride("__VITE_MAPBOX_ACCESS_TOKEN__");
  return override ?? import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
}

export function getMapboxGeocodingCountry(): string | undefined {
  const override = readOverride("__VITE_MAPBOX_GEOCODING_COUNTRY__");
  const raw = override ?? import.meta.env.VITE_MAPBOX_GEOCODING_COUNTRY;
  const value = typeof raw === "string" ? raw.trim() : "";
  return value ? value : undefined;
}
