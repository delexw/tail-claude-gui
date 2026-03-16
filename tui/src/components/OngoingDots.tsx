import { useState, useEffect } from "react";
import { Text } from "ink";
import { colors } from "../lib/theme.js";

/**
 * Braille spinner — matches the web's .braille-spinner CSS animation.
 * Single global timer shared across all instances to avoid render storms.
 */

const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

let globalFrame = 0;
let refCount = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const subscribers = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  refCount++;
  if (!timer) {
    timer = setInterval(() => {
      globalFrame = (globalFrame + 1) % BRAILLE_FRAMES.length;
      for (const fn of subscribers) fn();
    }, 100);
  }
  return () => {
    subscribers.delete(cb);
    refCount--;
    if (refCount <= 0 && timer) {
      clearInterval(timer);
      timer = null;
      refCount = 0;
    }
  };
}

/** Braille spinner for info bar / active session indicator. Matches web's braille-spinner. */
export function BrailleSpinner() {
  const [frame, setFrame] = useState(globalFrame);

  useEffect(() => subscribe(() => setFrame(globalFrame)), []);

  return (
    <Text color={colors.ongoing} bold>
      {BRAILLE_FRAMES[frame]} active
    </Text>
  );
}

/** Static green dot — matches web's CSS pulse dot (no animation in terminal to avoid re-render cost). */
export function OngoingDot() {
  return (
    <Text color={colors.ongoing} bold>
      ●
    </Text>
  );
}
