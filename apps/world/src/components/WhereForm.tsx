/* "Where is …?" in the text view: agent awareness (LOOPS_INTEGRATION_PLAN.md section 7.2) as text. The answer is the
   pure `where` of the world model, about 40 tokens, in zone labels; it is announced politely when it changes. */
import { useId, useMemo, useState } from "react";
import { where, type AgentPlacement } from "@crewhub/world-model";
import { Field } from "./primitives";
import { useWorld } from "../state/world";

export function WhereForm() {
  const { model } = useWorld();
  const [chosen, setChosen] = useState("");
  const answerId = useId(),
    titleId = useId();
  const agents = useMemo(() => {
    const all: AgentPlacement[] = [...model.buildings.flatMap((b) => b.agents), ...model.townHall, ...model.postOffice];
    const byKey = new Map<string, AgentPlacement>();
    for (const agent of all) if (!byKey.has(agent.key) || agent.presence === "real") byKey.set(agent.key, agent);
    return [...byKey.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [model]);
  const selected = agents.some((a) => a.key === chosen) ? chosen : (agents[0]?.key ?? "");
  return (
    <form className="where-form" onSubmit={(e) => e.preventDefault()} aria-labelledby={titleId}>
      <h3 id={titleId}>Where is …?</h3>
      <Field control="select" size="sm" label="Agent" value={selected} aria-describedby={answerId} onChange={(e) => setChosen(e.currentTarget.value)}>
        {agents.map((a) => (
          <option key={a.key} value={a.key}>
            {a.displayName}
          </option>
        ))}
      </Field>
      <p id={answerId} className="where-answer" aria-live="polite">
        {selected ? where(model, selected) : "No agents are in the world yet."}
      </p>
    </form>
  );
}
