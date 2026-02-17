import { PROFESSIONAL_TEMPLATE_DRAFTS, TemplateDraft } from "@/lib/email-template-catalog";

export interface EmailTemplateForPopulation {
  template_key: string;
  subject: string;
  html_content: string;
  text_content?: string | null;
  variables?: string[] | null;
}

const HANDLEBAR_TOKEN_REGEX = /\{\{[^}]+\}\}/g;
const SIMPLE_VAR_REGEX = /^\{\{(\w+)\}\}$/;
const IF_OPEN_REGEX = /^\{\{#if (\w+)\}\}$/;
const IF_CLOSE_REGEX = /^\{\{\/if\}\}$/;

function toLabel(variable: string): string {
  return variable
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function isValidTemplateSyntax(content: string, allowedVariables: string[]): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const allowed = new Set(allowedVariables);
  const stack: string[] = [];
  const tokens = content.match(HANDLEBAR_TOKEN_REGEX) || [];

  for (const token of tokens) {
    const simpleMatch = token.match(SIMPLE_VAR_REGEX);
    if (simpleMatch) {
      const varName = simpleMatch[1];
      if (allowed.size > 0 && !allowed.has(varName) && varName !== "body_content") {
        errors.push(`Unknown variable tag: ${token}`);
      }
      continue;
    }

    const ifOpenMatch = token.match(IF_OPEN_REGEX);
    if (ifOpenMatch) {
      const varName = ifOpenMatch[1];
      if (allowed.size > 0 && !allowed.has(varName)) {
        errors.push(`Unknown conditional variable: ${token}`);
      }
      stack.push(varName);
      continue;
    }

    if (IF_CLOSE_REGEX.test(token)) {
      if (stack.length === 0) {
        errors.push("Unmatched {{/if}} found");
      } else {
        stack.pop();
      }
      continue;
    }

    errors.push(`Unsupported template syntax: ${token}`);
  }

  if (stack.length > 0) {
    errors.push("One or more {{#if ...}} blocks are not closed");
  }

  return { ok: errors.length === 0, errors };
}

export function extractTags(content: string): Set<string> {
  const tags = new Set<string>();
  const tokens = content.match(HANDLEBAR_TOKEN_REGEX) || [];

  for (const token of tokens) {
    const simpleMatch = token.match(SIMPLE_VAR_REGEX);
    if (simpleMatch) {
      tags.add(simpleMatch[1]);
      continue;
    }
    const ifOpenMatch = token.match(IF_OPEN_REGEX);
    if (ifOpenMatch) {
      tags.add(ifOpenMatch[1]);
    }
  }

  return tags;
}

export function validateTemplateConformance(
  draft: TemplateDraft,
  allowedVariables: string[]
): { ok: boolean; errors: string[] } {
  const subjectSyntax = isValidTemplateSyntax(draft.subject, allowedVariables);
  const htmlSyntax = isValidTemplateSyntax(draft.html_content, allowedVariables);
  const errors = [...subjectSyntax.errors, ...htmlSyntax.errors];

  const presentTags = new Set<string>([
    ...extractTags(draft.subject),
    ...extractTags(draft.html_content),
  ]);

  for (const variable of allowedVariables) {
    if (!presentTags.has(variable)) {
      errors.push(`Missing required tag: {{${variable}}}`);
    }
  }

  if (!draft.subject.trim()) {
    errors.push("Subject cannot be empty");
  }
  if (!draft.html_content.trim()) {
    errors.push("HTML content cannot be empty");
  }

  return { ok: errors.length === 0, errors };
}

function isSubjectTagSafe(subject: string, allowedVariables: string[]): boolean {
  return isValidTemplateSyntax(subject, allowedVariables).ok;
}

export function buildFallbackDraftForCustomTemplate(
  template: EmailTemplateForPopulation
): TemplateDraft {
  const allowedVariables = Array.isArray(template.variables) ? template.variables : [];
  const hasTitleVar = allowedVariables.includes("title");
  const safeSubject = isSubjectTagSafe(template.subject, allowedVariables);
  const subject = safeSubject
    ? template.subject
    : hasTitleVar
      ? "{{title}}"
      : "MyMoto Notification";

  const listItems = allowedVariables
    .map((variable) => `<li><strong>${toLabel(variable)}:</strong> {{${variable}}}</li>`)
    .join("");

  const hasActionLink = allowedVariables.includes("actionLink");
  const hasActionText = allowedVariables.includes("actionText");
  const ctaBlock = hasActionLink
    ? `<p>{{#if actionLink}}<a href="{{actionLink}}">${hasActionText ? "{{actionText}}" : "View Details"}</a>{{/if}}</p>`
    : "";

  return {
    subject,
    html_content: `<p>Hello,</p>
<p>This is an important update from MyMoto.</p>
<p>Details:</p>
<ul>${listItems || "<li><strong>Message:</strong> {{message}}</li>"}</ul>
${ctaBlock}
<p>Best regards,<br/>MyMoto Team</p>`,
    text_content: null,
  };
}

export function buildDraftForTemplate(template: EmailTemplateForPopulation): TemplateDraft {
  const seededDraft = PROFESSIONAL_TEMPLATE_DRAFTS[
    template.template_key as keyof typeof PROFESSIONAL_TEMPLATE_DRAFTS
  ];
  const draft = seededDraft || buildFallbackDraftForCustomTemplate(template);
  return {
    ...draft,
    text_content: draft.text_content ?? stripHtml(draft.html_content),
  };
}

