/** Types for `answers-replay.mjs` (a plain-Node tool, so the TypeScript test can import its pure parts). */
export const BRANCHES: Readonly<Record<string, string>>;
export const ORDER: readonly string[];
export class Refusal extends Error {}
export function conflictBlocks(text: string): { lines: string[]; blocks: { start: number; end: number; a: string[]; b: string[] }[] };
export const RULES: Readonly<Record<string, { letter: string; resolve: (a: string[], b: string[]) => string[] }>>;
export function resolveText(file: string, text: string): string;
export function setupParagraphs(text: string): true;
export function healthKeys(testText: string, hostText: string): { text: string; changed: boolean };
