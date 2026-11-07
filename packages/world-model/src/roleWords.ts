/**
 * A role in words, with where it came from, so the card, the nameplate, the text view and the settings all say the
 * same thing: "lead, the project lead", "the postman, loops role router", "an external bot", "worker, a registered
 * agent (loops role lead)". Only a role from a name rule is an inference, and it says so.
 */
import type { RoleId, RoleSource } from "./model.ts";

/** Who set an override: the text view speaks of "a person", the page of "you". */
export type RoleVoice = "person" | "you";

/** The role and its source as one phrase, after "is" or on a nameplate. */
export function roleWords(role: RoleId, source: RoleSource, voice: RoleVoice = "person"): string {
  switch (source) {
    case "override":
      return `${role}, set by ${voice === "you" ? "you" : "a person"}`;
    case "project-lead":
      return "lead, the project lead";
    case "crewhub-lead":
      return "lead, the CrewHub lead";
    case "router":
      return "the postman, loops role router";
    case "external":
      return "an external bot";
    case "name-suffix":
      return "lead, from the -lead in its name";
    case "name-rule":
      return `${role}, from its name`;
    case "loops-role":
      return `${role}, a registered agent (loops role lead)`;
    case "team-worker":
      return `${role}, under its lead in the team snapshot`;
  }
}

/** The role as a noun for a list entry ("lead in CrewHub", "postman at the post office", "external bot at the town hall"). */
export function roleNoun(role: RoleId, source: RoleSource): string {
  if (source === "router") return "postman";
  if (source === "external") return "external bot";
  return role;
}

/** True when the role was read off the name, not told by loops or a person: the text view marks the line an inference. */
export const roleInferred = (source: RoleSource): boolean => source === "name-rule" || source === "name-suffix";
