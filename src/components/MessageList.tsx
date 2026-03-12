import { useRef, useCallback, useMemo } from "react";
import { useScrollToSelected } from "../hooks/useScrollToSelected";
import type { DisplayMessage } from "../types";
import { spinnerFrames } from "../lib/theme";
import { MessageItem } from "./MessageItem";

interface MessageListProps {
  messages: DisplayMessage[];
  selectedIndex: number;
  expandedSet: Set<number>;
  ongoing: boolean;
  animFrame: number;
  onSelect: (index: number) => void;
  onToggle: (index: number) => void;
  onOpenDetail: (index: number) => void;
}

export function MessageList({
  messages,
  selectedIndex,
  expandedSet,
  ongoing,
  animFrame,
  onSelect,
  onToggle,
  onOpenDetail,
}: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useScrollToSelected(selectedIndex);

  const handleClick = useCallback(
    (index: number) => {
      if (selectedIndex === index) {
        onToggle(index);
      } else {
        onSelect(index);
      }
    },
    [selectedIndex, onSelect, onToggle],
  );

  // Chronological order: oldest messages first
  const ordered = useMemo(() => {
    const indices: number[] = [];
    for (let i = 0; i < messages.length; i++) {
      indices.push(i);
    }
    return indices;
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="message-list">
        <div className="message-list__empty">No messages loaded</div>
      </div>
    );
  }

  return (
    <div className="message-list" ref={listRef}>
      {ordered.map((i) => {
        const msg = messages[i];
        if (msg.role === "compact") {
          return <CompactSeparator key={i} content={msg.content} />;
        }

        const isSelected = i === selectedIndex;
        const isFirst = i === 0;

        return (
          <MessageItem
            key={i}
            ref={isSelected ? selectedRef : undefined}
            message={msg}
            index={i}
            isSelected={isSelected}
            isExpanded={expandedSet.has(i)}
            onClick={handleClick}
            onOpenDetail={onOpenDetail}
            headerExtra={
              isFirst && ongoing ? (
                <span className="message__ongoing-spinner">
                  {spinnerFrames[animFrame % spinnerFrames.length]}
                </span>
              ) : undefined
            }
          />
        );
      })}
    </div>
  );
}

function CompactSeparator({ content }: { content: string }) {
  return (
    <div className="compact-separator">
      <div className="compact-separator__line">
        <span className="compact-separator__rule" />
        <span>{content}</span>
        <span className="compact-separator__rule" />
      </div>
    </div>
  );
}
