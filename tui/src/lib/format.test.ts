import { describe, it, expect } from "vitest";
import { shortModel, modelColor, roleColor, roleIcon, firstLine, formatJson } from "./format";

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
  it("returns red for opus", () => {
    expect(modelColor("claude-opus-4-6")).toBe("red");
  });

  it("returns blue for sonnet", () => {
    expect(modelColor("claude-sonnet-4-6")).toBe("blue");
  });

  it("returns green for haiku", () => {
    expect(modelColor("claude-haiku-4-5")).toBe("green");
  });

  it("returns white for unknown", () => {
    expect(modelColor("gpt-4")).toBe("white");
  });
});

describe("roleColor", () => {
  it("returns correct colors", () => {
    expect(roleColor("claude")).toBe("magenta");
    expect(roleColor("user")).toBe("green");
    expect(roleColor("system")).toBe("yellow");
    expect(roleColor("other")).toBe("white");
  });
});

describe("roleIcon", () => {
  it("returns correct icons", () => {
    expect(roleIcon("claude")).toBe("🤖");
    expect(roleIcon("user")).toBe("👤");
    expect(roleIcon("system")).toBe("⚙️");
    expect(roleIcon("other")).toBe("  ");
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
