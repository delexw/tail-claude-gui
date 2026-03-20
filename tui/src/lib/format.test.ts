import { describe, it, expect } from "vitest";
import {
  shortModel,
  modelColor,
  roleColor,
  roleIcon,
  firstLine,
  formatJson,
  prettyInlineJson,
  renderMarkdown,
} from "./format";
import { colors } from "./theme";
import { IconClaude, IconUser, IconSystem } from "./icons";

describe("shortModel", () => {
  it("strips claude- prefix and formats version", () => {
    expect(shortModel("claude-opus-4-6")).toBe("opus4.6");
    expect(shortModel("claude-sonnet-4-6")).toBe("sonnet4.6");
    expect(shortModel("claude-haiku-4-5-20251001")).toBe("haiku4.5");
  });

  it("handles models without claude- prefix", () => {
    expect(shortModel("opus-4-6")).toBe("opus4.6");
  });

  it("handles models without version parts", () => {
    expect(shortModel("claude-opus")).toBe("opus");
  });
});

describe("modelColor", () => {
  it("returns modelOpus hex for opus", () => {
    expect(modelColor("claude-opus-4-6")).toBe(colors.modelOpus);
  });

  it("returns modelSonnet hex for sonnet", () => {
    expect(modelColor("claude-sonnet-4-6")).toBe(colors.modelSonnet);
  });

  it("returns modelHaiku hex for haiku", () => {
    expect(modelColor("claude-haiku-4-5")).toBe(colors.modelHaiku);
  });

  it("returns textSecondary hex for unknown", () => {
    expect(modelColor("gpt-4")).toBe(colors.textSecondary);
  });
});

describe("roleColor", () => {
  it("returns correct hex colors", () => {
    expect(roleColor("claude")).toBe(colors.textSecondary);
    expect(roleColor("user")).toBe(colors.accent);
    expect(roleColor("system")).toBe(colors.textMuted);
    expect(roleColor("other")).toBe(colors.textPrimary);
  });
});

describe("roleIcon", () => {
  it("returns correct icons", () => {
    expect(roleIcon("claude")).toBe(IconClaude);
    expect(roleIcon("user")).toBe(IconUser);
    expect(roleIcon("system")).toBe(IconSystem);
    expect(roleIcon("other")).toBe(" ");
  });
});

describe("firstLine", () => {
  it("returns first line", () => {
    expect(firstLine("hello\nworld")).toBe("hello");
    expect(firstLine("single line")).toBe("single line");
  });
});

describe("formatJson", () => {
  it("pretty-prints valid JSON", () => {
    expect(formatJson('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it("returns original for invalid JSON", () => {
    expect(formatJson("not json")).toBe("not json");
  });
});

describe("prettyInlineJson", () => {
  it("pretty-prints bare JSON object at end of line", () => {
    const input = 'Let me write the output files. {"layers":[{"key":"A"}],"skipped":[]}';
    const result = prettyInlineJson(input);
    expect(result).toContain('"layers"');
    expect(result).toContain("Let me write the output files.");
    expect(result).not.toContain("```");
  });

  it("pretty-prints a bare JSON array", () => {
    const input = 'Results: [{"id":1},{"id":2}]';
    const result = prettyInlineJson(input);
    expect(result).toContain('"id"');
    expect(result).not.toContain("```");
  });

  it("leaves plain text unchanged", () => {
    expect(prettyInlineJson("Hello world")).toBe("Hello world");
  });

  it("does not modify content already in a code fence", () => {
    const input = '```json\n{"a":1}\n```';
    expect(prettyInlineJson(input)).toBe(input);
  });

  it("does not wrap trivially small JSON", () => {
    expect(prettyInlineJson('value: {"a":1}')).toBe('value: {"a":1}');
  });
});

describe("renderMarkdown", () => {
  it("strips markdown syntax and returns text content", () => {
    const result = renderMarkdown("**bold** and *italic* text");
    expect(result).toContain("bold");
    expect(result).toContain("italic");
    expect(result).toContain("text");
  });

  it("renders headers", () => {
    const result = renderMarkdown("# Title\n\nsome content");
    expect(result).toContain("Title");
    expect(result).toContain("some content");
  });

  it("renders bullet lists", () => {
    const result = renderMarkdown("- item one\n- item two");
    expect(result).toContain("item one");
    expect(result).toContain("item two");
  });

  it("handles plain text unchanged in content", () => {
    const result = renderMarkdown("just plain text here");
    expect(result).toContain("just plain text here");
  });

  it("fences and renders inline JSON as a code block", () => {
    const result = renderMarkdown('Output: {"layers":[{"key":"A"}],"skipped":[]}');
    expect(result).toContain("Output:");
    expect(result).toContain('"layers"');
  });
});
