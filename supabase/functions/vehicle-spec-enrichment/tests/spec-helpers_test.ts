import { buildUpdatePayload, normaliseKey } from "../spec-helpers.ts";

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test("normaliseKey lowercases and trims brand/model", () => {
  const key = normaliseKey("  Toyota ", " Corolla Cross Hybrid 1.8L ");
  assertEquals(key, "toyota|corolla cross hybrid 1.8l");
});

Deno.test("buildUpdatePayload keeps numeric efficiency and null-coalesces others", () => {
  const payload = buildUpdatePayload({
    fuel_type: "hybrid",
    official_fuel_efficiency_l_100km: 4.1,
    vehicle_type: "crossover",
  });

  assertEquals(payload.fuel_type, "hybrid");
  assertEquals(payload.official_fuel_efficiency_l_100km, 4.1);
  assertEquals(payload.engine_displacement, null);
  assertEquals(payload.usage_weight, null);
});

Deno.test("buildUpdatePayload drops non-numeric efficiency", () => {
  const payload = buildUpdatePayload({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    official_fuel_efficiency_l_100km: "8.5" as any,
    engine_displacement: "2.0L",
  });

  assertEquals(payload.official_fuel_efficiency_l_100km, null);
  assertEquals(payload.engine_displacement, "2.0L");
});
