import { calculateDaysOffline, shouldHibernateVehicle, HIBERNATION_DAYS } from "./vehicle-hibernation.ts"

Deno.test("calculateDaysOffline returns null for invalid input", () => {
  const result = calculateDaysOffline(null)
  if (result !== null) {
    throw new Error("expected null for null input")
  }
})

Deno.test("calculateDaysOffline computes days difference accurately", () => {
  const base = new Date("2024-01-01T00:00:00Z")
  const later = new Date(base.getTime() + 5 * 24 * 60 * 60 * 1000)

  const result = calculateDaysOffline(base.toISOString(), later)
  if (!result || Math.abs(result - 5) > 0.001) {
    throw new Error(`expected approximately 5 days, got ${result}`)
  }
})

Deno.test("shouldHibernateVehicle is false when below threshold", () => {
  const now = new Date("2024-01-15T00:00:00Z")
  const lastOnline = new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000)

  const { shouldHibernate } = shouldHibernateVehicle(lastOnline.toISOString(), now, HIBERNATION_DAYS)
  if (shouldHibernate) {
    throw new Error("expected shouldHibernate to be false for 13 days offline")
  }
})

Deno.test("shouldHibernateVehicle is true at 14 days threshold", () => {
  const now = new Date("2024-01-15T00:00:00Z")
  const lastOnline = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

  const { shouldHibernate } = shouldHibernateVehicle(lastOnline.toISOString(), now, HIBERNATION_DAYS)
  if (!shouldHibernate) {
    throw new Error("expected shouldHibernate to be true for 14 days offline")
  }
})

Deno.test("shouldHibernateVehicle works across time zones", () => {
  const lastOnline = "2024-02-01T10:00:00+02:00"
  const now = new Date("2024-02-15T10:00:00Z")

  const { shouldHibernate, daysOffline } = shouldHibernateVehicle(lastOnline, now, HIBERNATION_DAYS)
  if (!shouldHibernate) {
    throw new Error("expected shouldHibernate to be true across time zones")
  }
  if (!daysOffline || daysOffline < 13 || daysOffline > 15) {
    throw new Error(`unexpected daysOffline value: ${daysOffline}`)
  }
})

