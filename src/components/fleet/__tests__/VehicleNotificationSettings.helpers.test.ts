import { describe, expect, it } from "vitest";
import {
  stripAiChatPreferences,
  getSaveErrorMessage,
} from "../VehicleNotificationSettings";

describe("VehicleNotificationSettings helpers", () => {
  it("stripAiChatPreferences removes all AI Chat keys and keeps core fields", () => {
    const original = {
      id: "test-id",
      user_id: "user-1",
      device_id: "device-1",
      low_battery: false,
      critical_battery: true,
      overspeeding: false,
      harsh_braking: false,
      rapid_acceleration: false,
      ignition_on: false,
      ignition_off: false,
      vehicle_moving: true,
      geofence_enter: false,
      geofence_exit: false,
      idle_too_long: false,
      offline: true,
      online: false,
      maintenance_due: true,
      trip_completed: false,
      anomaly_detected: true,
      morning_greeting: false,
      enable_ai_chat_ignition_on: true,
      enable_ai_chat_offline: true,
      enable_ai_chat_maintenance_due: false,
    } as any;

    const stripped = stripAiChatPreferences(original);

    expect(stripped).toHaveProperty("user_id", "user-1");
    expect(stripped).toHaveProperty("device_id", "device-1");
    expect(stripped).toHaveProperty("critical_battery", true);
    expect(stripped).not.toHaveProperty("enable_ai_chat_ignition_on");
    expect(stripped).not.toHaveProperty("enable_ai_chat_offline");
    expect(stripped).not.toHaveProperty("enable_ai_chat_maintenance_due");
  });

  it("getSaveErrorMessage maps permission errors", () => {
    const msg = getSaveErrorMessage({
      code: "PGRST301",
      message: "permission denied for table vehicle_notification_preferences",
    });
    expect(msg).toMatch(/Permission denied/i);
  });

  it("getSaveErrorMessage maps foreign key errors", () => {
    const msg = getSaveErrorMessage({
      code: "23503",
      message: "insert or update on table violates foreign key constraint",
    });
    expect(msg).toMatch(/Related vehicle or user record is missing/i);
  });

  it("getSaveErrorMessage maps missing table errors", () => {
    const msg = getSaveErrorMessage({
      code: "42P01",
      message: 'relation "vehicle_notification_preferences" does not exist',
    });
    expect(msg).toMatch(/table is missing/i);
  });

  it("getSaveErrorMessage maps missing AI Chat column errors", () => {
    const msg = getSaveErrorMessage({
      code: "42703",
      message: 'column "enable_ai_chat_offline" does not exist',
    });
    expect(msg).toMatch(/schema is missing AI Chat columns/i);
  });

  it("getSaveErrorMessage falls back to generic message", () => {
    const msg = getSaveErrorMessage({
      code: "99999",
      message: "unexpected error",
    });
    expect(msg).toBe("unexpected error");
  });
});
