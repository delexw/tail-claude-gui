import { describe, it, expect } from "vitest";
import {
  colors,
  teamColors,
  toolCategoryIcons,
  spinnerFrames,
  getModelColor,
  getTeamColor,
  getContextColor,
} from "./theme";

describe("colors", () => {
  it("contains expected model colors", () => {
    expect(colors.modelOpus).toBe("#ff5f87");
    expect(colors.modelSonnet).toBe("#5fafff");
    expect(colors.modelHaiku).toBe("#87d787");
  });

  it("contains expected text colors", () => {
    expect(colors.textPrimary).toBe("#d0d0d0");
    expect(colors.textSecondary).toBe("#8a8a8a");
    expect(colors.textDim).toBe("#767676");
    expect(colors.textMuted).toBe("#585858");
  });

  it("contains expected accent and status colors", () => {
    expect(colors.accent).toBe("#5fafff");
    expect(colors.error).toBe("#ff0000");
    expect(colors.info).toBe("#5f87ff");
  });

  it("contains expected context threshold colors", () => {
    expect(colors.contextOk).toBe("#87d787");
    expect(colors.contextWarn).toBe("#ff8700");
    expect(colors.contextCrit).toBe("#ff0000");
  });

  it("contains background colors", () => {
    expect(colors.bg).toBe("#1a1a2e");
    expect(colors.bgSurface).toBe("#16213e");
    expect(colors.bgElevated).toBe("#222244");
    expect(colors.bgHover).toBe("#2a2a4a");
  });

  it("contains permission pill colors", () => {
    expect(colors.pillBypass).toBe("#ff0000");
    expect(colors.pillAcceptEdits).toBe("#af5fff");
    expect(colors.pillPlan).toBe("#87d787");
  });
});

describe("teamColors", () => {
  it("has exactly 8 team colors", () => {
    expect(Object.keys(teamColors)).toHaveLength(8);
  });

  it("maps each color name to the correct hex value", () => {
    expect(teamColors.blue).toBe("#5fafff");
    expect(teamColors.green).toBe("#87d787");
    expect(teamColors.red).toBe("#ff5f87");
    expect(teamColors.yellow).toBe("#ffdf00");
    expect(teamColors.purple).toBe("#d787ff");
    expect(teamColors.cyan).toBe("#5fafaf");
    expect(teamColors.orange).toBe("#ff8700");
    expect(teamColors.pink).toBe("#ff87af");
  });
});

describe("getModelColor", () => {
  it("returns modelOpus color for strings containing 'opus'", () => {
    expect(getModelColor("opus")).toBe(colors.modelOpus);
    expect(getModelColor("claude-opus-4")).toBe(colors.modelOpus);
    expect(getModelColor("some-opus-variant")).toBe(colors.modelOpus);
  });

  it("returns modelSonnet color for strings containing 'sonnet'", () => {
    expect(getModelColor("sonnet")).toBe(colors.modelSonnet);
    expect(getModelColor("claude-sonnet-4")).toBe(colors.modelSonnet);
  });

  it("returns modelHaiku color for strings containing 'haiku'", () => {
    expect(getModelColor("haiku")).toBe(colors.modelHaiku);
    expect(getModelColor("claude-haiku-3")).toBe(colors.modelHaiku);
  });

  it("returns textSecondary for unknown model strings", () => {
    expect(getModelColor("gpt-4")).toBe(colors.textSecondary);
    expect(getModelColor("unknown")).toBe(colors.textSecondary);
    expect(getModelColor("")).toBe(colors.textSecondary);
  });

  it("checks in priority order: opus > sonnet > haiku", () => {
    // A string containing both "opus" and "sonnet" should match opus first
    expect(getModelColor("opus-sonnet")).toBe(colors.modelOpus);
    expect(getModelColor("sonnet-haiku")).toBe(colors.modelSonnet);
  });
});

describe("getTeamColor", () => {
  it("returns the correct color for each lowercase team name", () => {
    expect(getTeamColor("blue")).toBe(teamColors.blue);
    expect(getTeamColor("green")).toBe(teamColors.green);
    expect(getTeamColor("red")).toBe(teamColors.red);
    expect(getTeamColor("yellow")).toBe(teamColors.yellow);
    expect(getTeamColor("purple")).toBe(teamColors.purple);
    expect(getTeamColor("cyan")).toBe(teamColors.cyan);
    expect(getTeamColor("orange")).toBe(teamColors.orange);
    expect(getTeamColor("pink")).toBe(teamColors.pink);
  });

  it("is case-insensitive", () => {
    expect(getTeamColor("Blue")).toBe(teamColors.blue);
    expect(getTeamColor("BLUE")).toBe(teamColors.blue);
    expect(getTeamColor("RED")).toBe(teamColors.red);
    expect(getTeamColor("Green")).toBe(teamColors.green);
    expect(getTeamColor("PURPLE")).toBe(teamColors.purple);
  });

  it("returns accent color for unknown team names", () => {
    expect(getTeamColor("unknown")).toBe(colors.accent);
    expect(getTeamColor("")).toBe(colors.accent);
    expect(getTeamColor("turquoise")).toBe(colors.accent);
  });
});

describe("getContextColor", () => {
  it("returns contextOk (green) for values below 50", () => {
    expect(getContextColor(0)).toBe(colors.contextOk);
    expect(getContextColor(25)).toBe(colors.contextOk);
    expect(getContextColor(49)).toBe(colors.contextOk);
    expect(getContextColor(49.9)).toBe(colors.contextOk);
  });

  it("returns contextWarn (orange) for values from 50 to 79", () => {
    expect(getContextColor(50)).toBe(colors.contextWarn);
    expect(getContextColor(65)).toBe(colors.contextWarn);
    expect(getContextColor(79)).toBe(colors.contextWarn);
    expect(getContextColor(79.9)).toBe(colors.contextWarn);
  });

  it("returns contextCrit (red) for values 80 and above", () => {
    expect(getContextColor(80)).toBe(colors.contextCrit);
    expect(getContextColor(90)).toBe(colors.contextCrit);
    expect(getContextColor(100)).toBe(colors.contextCrit);
    expect(getContextColor(150)).toBe(colors.contextCrit);
  });

  it("handles exact boundary values", () => {
    expect(getContextColor(49)).toBe(colors.contextOk);
    expect(getContextColor(50)).toBe(colors.contextWarn);
    expect(getContextColor(79)).toBe(colors.contextWarn);
    expect(getContextColor(80)).toBe(colors.contextCrit);
  });

  it("handles negative values as contextOk", () => {
    expect(getContextColor(-1)).toBe(colors.contextOk);
    expect(getContextColor(-100)).toBe(colors.contextOk);
  });
});

describe("toolCategoryIcons", () => {
  it("has entries for all expected tool categories", () => {
    const expectedKeys = [
      "Read",
      "Edit",
      "Write",
      "Bash",
      "Grep",
      "Glob",
      "Task",
      "Tool",
      "Web",
      "Cron",
      "Other",
    ];
    for (const key of expectedKeys) {
      expect(toolCategoryIcons).toHaveProperty(key);
    }
    expect(Object.keys(toolCategoryIcons)).toHaveLength(expectedKeys.length);
  });

  it("maps each category to a non-empty string", () => {
    for (const value of Object.values(toolCategoryIcons)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

describe("spinnerFrames", () => {
  it("has exactly 10 frames", () => {
    expect(spinnerFrames).toHaveLength(10);
  });

  it("contains only non-empty strings", () => {
    for (const frame of spinnerFrames) {
      expect(typeof frame).toBe("string");
      expect(frame.length).toBeGreaterThan(0);
    }
  });

  it("contains braille characters", () => {
    // Braille pattern characters are in the range U+2800 to U+28FF
    for (const frame of spinnerFrames) {
      const codePoint = frame.codePointAt(0)!;
      expect(codePoint).toBeGreaterThanOrEqual(0x2800);
      expect(codePoint).toBeLessThanOrEqual(0x28ff);
    }
  });
});
