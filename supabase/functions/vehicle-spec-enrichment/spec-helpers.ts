export type EnrichedSpecs = {
  fuel_type?: string | null;
  engine_displacement?: string | null;
  official_fuel_efficiency_l_100km?: number | null;
  vehicle_type?: string | null;
  usage_weight?: string | null;
};

export function normaliseKey(brand: string, model: string): string {
  return `${brand}`.toLowerCase().trim() + "|" + `${model}`.toLowerCase().trim();
}

export function buildUpdatePayload(specs: EnrichedSpecs): EnrichedSpecs {
  return {
    fuel_type: specs.fuel_type ?? null,
    engine_displacement: specs.engine_displacement ?? null,
    official_fuel_efficiency_l_100km:
      typeof specs.official_fuel_efficiency_l_100km === "number"
        ? specs.official_fuel_efficiency_l_100km
        : null,
    vehicle_type: specs.vehicle_type ?? null,
    usage_weight: specs.usage_weight ?? null,
  };
}
