/**
 * The index is the package's interface (round 61, W10a): it exports what `apps/*`, `packages/demo` and the other
 * packages import, and nothing else. Tests in this package read the source files, so a value with no caller outside
 * does not belong here; types cost nothing and are not counted. Add a name below when a file outside the package
 * starts importing it; take it out when the last one stops.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import * as model from "../src/index.ts";

const INTERFACE = [
  "agentCardFacts", "agentLook", "agentWords", "amendHistory", "applyEdit", "archivedSince", "archivedWords",
  "builtinIds", "canRedo", "canUndo", "CIVIC_WORDS", "commitHistory", "createCatalogue", "createHistory",
  "currentDocument", "DEFAULT_PRESENCE", "DEFAULT_ZONE_ID", "describeIntent", "describeTownDocument",
  "describeWorld", "DESK_WORDS", "DIRECTOR_MODEL", "doneWord", "effectivePresence", "emptyMemory",
  "emptyTownDocument", "estimateTokens", "exportTownDocument", "extractPropRequest", "figureLook", "HALL_LABELS",
  "HALL_PLACES", "hallOf", "hallSummary", "HISTORY_LIMIT", "immovableReason", "importedPropId", "importTownDocument",
  "jsonBlocks", "laneLook", "movedAgents", "nextZoneMark", "noPlanLine", "normalizePresence", "pinnedCard",
  "placeFor", "planInput", "PRESENCE_LIMITS", "Projection", "propRequestsFromFacts", "quietWords", "RACK_NAMES",
  "redoHistory", "reduceWorld", "restoreHistory", "richJsonBlocks", "roleNoun", "roleWords", "ROOM_KINDS",
  "RULE_IDS", "ruleProps", "runWords", "sameSign", "townChanges", "undoHistory", "validateIntents",
  "validateTownDocument", "where", "ZONE_COLORS", "ZONE_EMBLEMS", "zoneById", "zoningOf",
];

test("the index exports exactly the values something outside the package imports", () => {
  const exported = Object.keys(model).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  assert.deepEqual(exported, INTERFACE);
});
