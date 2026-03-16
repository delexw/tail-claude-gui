import { useState, useEffect } from "react";
import { Text } from "ink";
import { colors } from "../lib/theme.js";

interface OngoingDotsProps {
  count?: number;
}

/**
 * Animated pulsing dots indicator — terminal equivalent of the web's
 * CSS-animated OngoingDots. Each dot lights up in sequence then fades,
 * creating a wave effect matching the web's staggered animation.
 */
export function OngoingDots({ count = 5 }: OngoingDotsProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % (count + 2));
    }, 200);
    return () => clearInterval(timer);
  }, [count]);

  const dots: string[] = [];
  for (let i = 0; i < count; i++) {
    // "active" dot is bright, others dim — active sweeps left to right
    dots.push(i === frame || i === frame - 1 ? "●" : "·");
  }

  return (
    <Text color={colors.ongoing} bold>
      {dots.join("")}
    </Text>
  );
}
