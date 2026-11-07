/* `npm run loops:fake`'s command line as a pure function (src/fakeArgs.ts, round 64, L-1): what it starts with, what it
   refuses and in which words. The exit codes and the no-start are `mainArgs.test.ts`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFakeArgs } from "../src/fakeArgs.ts";

const USAGE = "Usage: npm run loops:fake -- --port 8391 [--scenario small-team] [--speed 1] [--builder-key] [--viewer-key] [--help]";

function refusal(...argv: string[]): string {
  const parsed = parseFakeArgs(argv);
  assert.equal(parsed.kind, "refuse", `${argv.join(" ")} is refused`);
  return parsed.kind === "refuse" ? parsed.text : "";
}

test("no flags: the defaults", () => {
  assert.deepEqual(parseFakeArgs([]), { kind: "start", port: 8391, scenario: "small-team", speed: 1, builderKey: false, viewerKey: false });
});

test("every option is read, in any order", () => {
  assert.deepEqual(parseFakeArgs(["--builder-key", "--speed", "16", "--scenario", "studio", "--port", "0"]), { kind: "start", port: 0, scenario: "studio", speed: 16, builderKey: true, viewerKey: false });
  assert.deepEqual(parseFakeArgs(["--speed", "0"]), { kind: "start", port: 8391, scenario: "small-team", speed: 0, builderKey: false, viewerKey: false });
});

test("a repeated option keeps its first value, as before", () => {
  assert.deepEqual(parseFakeArgs(["--port", "5386", "--port", "0"]), { kind: "start", port: 5386, scenario: "small-team", speed: 1, builderKey: false, viewerKey: false });
});

test("--help and -h answer with the usage and one line per option, wherever they stand", () => {
  for (const argv of [["--help"], ["-h"], ["--port", "0", "--help"], ["--help", "--bogus"], ["--bogus", "-h"], ["--speed", "3", "--help"], ["--port", "--help"]]) {
    const parsed = parseFakeArgs(argv);
    assert.equal(parsed.kind, "help", argv.join(" "));
    const lines = parsed.kind === "help" ? parsed.text.split("\n") : [];
    assert.equal(lines[0], USAGE);
    assert.equal(lines.length, 7);
    assert.match(lines[1] ?? "", /^ {2}--port <port> .*default 8391.*0 takes a free port.*8091, 8000, 9443, 5180/);
    assert.match(lines[2] ?? "", /^ {2}--scenario <id> .*default small-team.*fresh, one, small-team, studio/);
    assert.match(lines[3] ?? "", /^ {2}--speed <n> .*default 1.*0, 1, 4, 16/);
    assert.match(lines[4] ?? "", /^ {2}--builder-key /);
    assert.match(lines[5] ?? "", /^ {2}--viewer-key /);
    assert.match(lines[6] ?? "", /^ {2}--help, -h /);
  }
});

test("an unknown flag or a stray word: one sentence naming it, then the usage line", () => {
  assert.equal(refusal("--bogus"), `"--bogus" is not a flag of the fake\n${USAGE}`);
  assert.equal(refusal("--prot", "5386"), `"--prot" is not a flag of the fake\n${USAGE}`);
  assert.equal(refusal("--port=5386"), `"--port=5386" is not a flag of the fake\n${USAGE}`);
  assert.equal(refusal("-p"), `"-p" is not a flag of the fake\n${USAGE}`);
  assert.equal(refusal("--"), `"--" is not a flag of the fake\n${USAGE}`);
  assert.equal(refusal("stray"), `"stray" is a stray word: the fake takes flags only\n${USAGE}`);
  assert.equal(refusal("--port", "0", "5386"), `"5386" is a stray word: the fake takes flags only\n${USAGE}`);
  assert.equal(refusal("--builder-key", "true"), `"true" is a stray word: the fake takes flags only\n${USAGE}`);
  assert.equal(refusal(""), `"" is a stray word: the fake takes flags only\n${USAGE}`);
});

test("the first unknown word is the one named", () => {
  assert.match(refusal("--one", "--two"), /^"--one" /);
});

test("--name value needs its value: at the end, or before another --flag", () => {
  for (const name of ["port", "scenario", "speed"]) {
    assert.equal(refusal(`--${name}`), `--${name} needs a value`);
    assert.equal(refusal(`--${name}`, "--builder-key"), `--${name} needs a value`);
  }
});

test("the port rule is fakePortVerdict's, in its words", () => {
  assert.equal(refusal("--port", "abc"), '--port must be a port number, not "abc"');
  assert.equal(refusal("--port", "-1"), '--port must be a port number, not "-1"');
  assert.equal(refusal("--port", ""), '--port must be a port number, not ""');
  assert.match(refusal("--port", "8091"), /^--port 8091: that is the Mac app's port/);
  assert.match(refusal("--port", "5180"), /^--port 5180: that is the world host's default port/);
});

test("an unknown scenario is refused with the known ids", () => {
  assert.equal(refusal("--scenario", "smal-team"), "--scenario smal-team: no such demo scenario; one of fresh, one, small-team, studio");
});

test("the speed is one of the four", () => {
  for (const speed of ["2", "-1", "fast"]) assert.equal(refusal("--speed", speed), "--speed must be one of 0, 1, 4, 16");
});

test("the rules' order stays: flags first, then port, scenario, speed", () => {
  assert.match(refusal("--speed", "3", "--scenario", "nope", "--port", "abc", "--bogus"), /^"--bogus" /);
  assert.match(refusal("--speed", "3", "--scenario", "nope", "--port", "abc"), /^--port must be/);
  assert.match(refusal("--speed", "3", "--scenario", "nope"), /^--scenario nope/);
});
