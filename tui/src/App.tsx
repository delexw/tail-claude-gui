import { useState } from "react";
import { useApp, useInput } from "ink";
import type { SessionInfo } from "./api.js";
import { SessionPicker } from "./SessionPicker.js";
import { MessageView } from "./MessageView.js";

type View = { kind: "picker" } | { kind: "session"; session: SessionInfo };

export function App() {
  const { exit } = useApp();
  const [view, setView] = useState<View>({ kind: "picker" });

  useInput((input) => {
    if (input === "q" && view.kind === "picker") {
      exit();
    }
  });

  if (view.kind === "session") {
    return (
      <MessageView sessionPath={view.session.path} onBack={() => setView({ kind: "picker" })} />
    );
  }

  return <SessionPicker onSelect={(session) => setView({ kind: "session", session })} />;
}
