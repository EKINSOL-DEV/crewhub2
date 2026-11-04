/* "Where is …?" in the text view: agent awareness (LOOPS_INTEGRATION_PLAN.md section 7.2) as text. The answer is the
   pure `where` of the world model, about 40 tokens, in zone labels; it is announced politely when it changes. The asker
   here is a person picking a name (never the agent itself), so the answer is in the third person: "cr-lead is on the floor
   of …" (decision 8, round 15). */
import { useId, useMemo, useState } from "react";
import { where, type AgentPlacement, type CivicWords, type RoomWording } from "@crewhub/world-model";
import { Field } from "./primitives";
import { useWorld } from "../state/runtimes";
import { goneWords, whereChoice, type WhereChosen } from "../state/whereChoice";

/** `civic`: what the town hall and the post office are called at the town's size (the lodge, the mailbox). `rooms`: the
    words for places, the classic rooms or the three halls, as the building is drawn. */
export function WhereForm({ civic, rooms = "classic" }: { civic?: CivicWords; rooms?: RoomWording }) {
  const { model } = useWorld();
  const [chosen, setChosen] = useState<WhereChosen | null>(null);
  const answerId = useId(),
    titleId = useId();
  const agents = useMemo(() => {
    const all: AgentPlacement[] = [...model.buildings.flatMap((b) => b.agents), ...model.townHall, ...model.postOffice];
    const byKey = new Map<string, AgentPlacement>();
    for (const agent of all) if (!byKey.has(agent.key) || agent.presence === "real") byKey.set(agent.key, agent);
    return [...byKey.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [model]);
  // People in the world right now (carrying work into Done): asked for by their principal id, like an agent.
  const people = useMemo(() => {
    const byId = new Map<string, string>();
    for (const b of model.buildings) for (const v of b.visits) if (!byId.has(v.personId)) byId.set(v.personId, v.displayName);
    return [...byId].sort((a, b) => a[1].localeCompare(b[1]));
  }, [model]);
  // A chosen name that leaves stays chosen and is said to be gone (state/whereChoice.ts, round 50 U6).
  const { selected, gone, options } = whereChoice(agents, people, chosen);
  const pick = (key: string) => {
    // The gone option is the chosen one itself: it keeps its name.
    const name = agents.find((a) => a.key === key)?.displayName ?? people.find(([id]) => id === key)?.[1] ?? chosen?.name ?? key;
    setChosen({ key, name });
  };
  return (
    <form className="where-form" onSubmit={(e) => e.preventDefault()} aria-labelledby={titleId}>
      <h3 id={titleId}>Where is …?</h3>
      <Field control="select" size="sm" label="Agent" value={selected} aria-describedby={answerId} onChange={(e) => pick(e.currentTarget.value)}>
        {agents.map((a) => (
          <option key={a.key} value={a.key}>
            {a.displayName}
          </option>
        ))}
        {people.map(([id, name]) => (
          <option key={`person:${id}`} value={id}>
            {name} (person)
          </option>
        ))}
        {options.map((o) => (
          <option key={`gone:${o.key}`} value={o.key}>
            {o.label}
          </option>
        ))}
      </Field>
      <p id={answerId} className="where-answer" aria-live="polite">
        {gone !== null ? goneWords(gone) : selected ? where(model, selected, civic, rooms) : "No agents are in the world yet."}
      </p>
    </form>
  );
}
