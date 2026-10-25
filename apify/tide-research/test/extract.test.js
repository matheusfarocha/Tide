import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyTechnique, isRelevant } from "../src/extract.js";

const pad = (s) => `${s} ${"Participants completed questionnaires before and after the study period. ".repeat(4)}`;

test("keeps meditation and breathing-practice papers", () => {
  assert.ok(isRelevant("Self-administered mindfulness interventions reduce stress", pad("A mindfulness programme.")));
  assert.ok(isRelevant("Slow breathing for reducing stress: the effect of extending exhale", pad("Slow breathing lowered stress.")));
  assert.ok(isRelevant("Inferring mind wandering from perceptual decision making", pad("Mind wandering was measured.")));
  assert.ok(isRelevant("A pilot study in first-year students", pad("Students practised mindful breathing. Meditation was guided.")));
});

test("drops papers that only mention a practice in passing", () => {
  assert.equal(isRelevant("Blood pressure in older adults", pad("One group also tried slow breathing.")), false);
});

test("drops settings TIDE's users are never in", () => {
  assert.equal(isRelevant("Neonatal endotracheal intubation: an educational program", pad("Mindfulness and slow breathing helped trainees.")), false);
  assert.equal(isRelevant("Hypnosis reshapes stress response in medical students", pad("Meditation and hypnosis were compared.")), false);
  assert.equal(isRelevant("Mental training in the national ice hockey team", pad("Mindfulness meditation was taught.")), false);
  // One passing mention in a long abstract is not enough to drop a meditation paper.
  assert.ok(isRelevant("Mindfulness meditation and attention", pad("Unlike athletes in earlier work, these were students.")));
});

test("classifies the technique from the title first", () => {
  assert.equal(classifyTechnique("A mind you can count on: validating breath counting", ""), "breathCounting");
  assert.equal(classifyTechnique("Two weeks of body scan practice", "focused attention"), "bodyScan");
  assert.equal(classifyTechnique("Mindfulness and stress", "Participants practised focused attention on the breath."), "breathFocus");
});
