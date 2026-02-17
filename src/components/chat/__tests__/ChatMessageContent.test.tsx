import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatMessageContent } from "../ChatMessageContent";

vi.mock("leaflet", () => ({ default: {} }));

describe("ChatMessageContent integration", () => {
  it("renders TRIP_TABLE payload as an HTML table with headers and cells", () => {
    const content = [
      "Trip report:",
      '[TRIP_TABLE: | Day | Trips | Distance |',
      "| --- | --- | --- |",
      "| Monday | 3 | 24.5 km |",
      "| Tuesday | 1 | 7.2 km | ]",
    ].join("\n");

    const html = renderToStaticMarkup(
      <ChatMessageContent content={content} isUser={false} />
    );

    expect(html).toContain("<table");
    expect(html).toContain("Day");
    expect(html).toContain("Trips");
    expect(html).toContain("Distance");
    expect(html).toContain("Monday");
    expect(html).toContain("24.5 km");
    expect(html).toContain("Tuesday");
    expect(html).toContain("7.2 km");
  });
});
