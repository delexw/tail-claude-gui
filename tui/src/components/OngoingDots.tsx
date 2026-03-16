import { Box, Text } from "ink";
import { colors } from "../lib/theme.js";

/** Static green dot — no animation, no timer, no re-renders. */
export function OngoingDot() {
  return (
    <Text color={colors.ongoing} bold>
      ●
    </Text>
  );
}

/**
 * Activity beads — 5 static dots with color gradient matching Go TUI.
 * Go TUI animates these, but we keep them static to avoid re-render shaking.
 * Gradient: accent (head) → info → textSecondary → textMuted (tail)
 * Glyph: U+EABC (nf-cod-circle, filled circle)
 */
const BEAD = "\uEABC";
const BEADS = [
  { id: "head", color: colors.accent },
  { id: "near", color: colors.info },
  { id: "mid", color: colors.textSecondary },
  { id: "far", color: colors.textDim },
  { id: "tail", color: colors.textMuted },
];

export function BrailleSpinner() {
  return (
    <Box>
      {BEADS.map((b) => (
        <Text key={b.id} color={b.color}>
          {BEAD}
        </Text>
      ))}
    </Box>
  );
}
