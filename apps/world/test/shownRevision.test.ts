import assert from "node:assert/strict";
import test from "node:test";
import { describeTownDocument, createCatalogue, emptyTownDocument } from "@crewhub/world-model";
import { exportFileName, shownRevision } from "../src/world/revisionWords.ts";

test("w6-10: one revision number on screen: the host's record while the host keeps the town, the document's own otherwise; the export is named after it", () => {
  const doc = { ...emptyTownDocument("greenhouse"), revision: 4 };
  assert.equal(shownRevision({ hostRev: 5, doc }), 5, "live, kept by the host: the record's number");
  assert.equal(shownRevision({ hostRev: null, doc }), 4, "the demo, or the host away: the document's");
  assert.equal(exportFileName({ hostRev: 5, doc }), "crewhub-town-r5.json", "as the host names its own export");
  assert.equal(exportFileName({ hostRev: null, doc }), "crewhub-town-r4.json");
});

test("the text view's Build line says the revision it is given, else the document's", () => {
  const doc = { ...emptyTownDocument("greenhouse"), revision: 4 };
  const catalogue = createCatalogue({}, doc);
  assert.match(describeTownDocument(doc, catalogue, { revision: 5 })[0]!.text, /^Town layout revision 5, /);
  assert.match(describeTownDocument(doc, catalogue)[0]!.text, /^Town layout revision 4, /);
});
