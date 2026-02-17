import { describe, expect, it } from "vitest";
import {
  buildDraftForTemplate,
  buildFallbackDraftForCustomTemplate,
  extractTags,
  validateTemplateConformance,
} from "@/lib/email-template-populator";

describe("email-template-populator", () => {
  it("returns approved seeded draft for known template key", () => {
    const draft = buildDraftForTemplate({
      template_key: "welcome",
      subject: "Old Subject",
      html_content: "<p>old</p>",
      variables: ["userName", "vehicleCount", "loginLink"],
    });

    expect(draft.subject).toBe("Welcome to MyMoto, {{userName}}");
    expect(draft.html_content).toContain("{{vehicleCount}}");
    expect(draft.html_content).toContain("{{loginLink}}");
  });

  it("builds professional fallback for unknown template", () => {
    const draft = buildFallbackDraftForCustomTemplate({
      template_key: "custom_alert",
      subject: "Bad subject {{#each data}}",
      html_content: "",
      variables: ["title", "message", "actionLink", "actionText"],
    });

    expect(draft.subject).toBe("{{title}}");
    expect(draft.html_content).toContain("{{message}}");
    expect(draft.html_content).toContain("{{#if actionLink}}");
  });

  it("rejects unsupported template syntax", () => {
    const result = validateTemplateConformance(
      {
        subject: "{{#each users}}List{{/each}}",
        html_content: "<p>Hello {{userName}}</p>",
      },
      ["userName"]
    );

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("Unsupported template syntax"))).toBe(true);
  });

  it("enforces full variable coverage", () => {
    const result = validateTemplateConformance(
      {
        subject: "Hello {{userName}}",
        html_content: "<p>Welcome</p>",
      },
      ["userName", "actionLink"]
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Missing required tag: {{actionLink}}");
  });

  it("extracts variables from direct and conditional tags", () => {
    const tags = extractTags("{{title}} {{#if actionLink}}Go{{/if}}");
    expect(Array.from(tags).sort()).toEqual(["actionLink", "title"]);
  });
});

