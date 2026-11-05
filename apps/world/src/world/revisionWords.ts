/* The one revision number the page shows (round 65, w6-10). A live town has two counters: the host's record (the
   Connection panel's "Revision 5", the page's data-town-rev) and the document's own (always one behind), and Settings,
   the text view and the export's name showed the latter. While the host keeps the town, every place now shows the
   record's number, as the host names its own export (crewhub-town-r<rev>.json); the document's number stays in the
   file. In the demo, or while the host is away, the document's is the only one. Pure. */

export interface RevisionFacts {
  /** The host's revision this browser is on (TownState.hostRev); null in the demo and while the host is away. */
  hostRev: number | null;
  doc: { revision: number };
}

export const shownRevision = (town: RevisionFacts): number => town.hostRev ?? town.doc.revision;

export const exportFileName = (town: RevisionFacts): string => `crewhub-town-r${shownRevision(town)}.json`;
