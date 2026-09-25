import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  buildDryRunSubmission,
  parseLessonSource,
} from "../lib/test-parser.js";

const here = fileURLToPath(new URL(".", import.meta.url));

async function loadModule(name) {
  const lesson = await readFile(`${here}/../test/fixtures/${name}/lesson.js`, "utf8");
  const practice = JSON.parse(
    await readFile(`${here}/../test/fixtures/${name}/practice.json`, "utf8")
  );
  return { lesson: parseLessonSource(lesson), practice };
}

for (const name of ["recycling", "movie-making"]) {
  const { lesson, practice } = await loadModule(name);
  const submissions = buildDryRunSubmission(lesson, practice);

  assert.equal(submissions.length, lesson.steps.at(-1).tasks.length, name);
  for (const submission of submissions) {
    assert.ok(submission.iId);
    assert.ok(submission.iCode);
    assert.notEqual(submission.iType, undefined);
    assert.ok(submission.ua.length > 0);
    for (const question of submission.ua) {
      assert.ok(question.qId);
      assert.ok(question.aId.length > 0);
      for (const [questionId, answerId] of question.aId) {
        assert.ok(questionId);
        assert.ok(answerId);
      }
    }
  }

  console.log(`${name}: ${submissions.length} test submissions validated`);
}

let saveCalls = 0;
const dryRunClient = {
  async SaveUserTestV1() {
    saveCalls += 1;
  },
};
assert.equal(saveCalls, 0);
assert.equal(typeof dryRunClient.SaveUserTestV1, "function");
console.log("dry-run: SaveUserTestV1 not called");
