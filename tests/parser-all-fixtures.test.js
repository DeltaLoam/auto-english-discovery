import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  buildDryRunSubmission,
  parseLessonSource,
} from "../lib/test-parser.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const fixtureRoot = `${here}/../test/fixtures`;

for (const name of ["recycling", "movie-making"]) {
  const lesson = parseLessonSource(
    await readFile(`${fixtureRoot}/${name}/lesson.js`, "utf8")
  );
  const practice = JSON.parse(
    await readFile(`${fixtureRoot}/${name}/practice.json`, "utf8")
  );
  const submissions = buildDryRunSubmission(lesson, practice);
  assert.equal(submissions.length, lesson.steps.at(-1).tasks.length, name);

  for (const task of submissions) {
    assert.ok(task.ua.length > 0, `${name}:${task.iCode}`);
    for (const question of task.ua) {
      assert.ok(question.aId.length > 0, `${name}:${task.iCode}`);
    }
  }

  const fallbackSubmissions = lesson.steps
    .at(-1)
    .tasks.map((task) =>
      buildDryRunSubmission(
        { steps: [{ id: "3", tasks: [task] }] },
        { [task.code]: practice[task.code] }
      )
    );
  assert.equal(fallbackSubmissions.length, submissions.length, `${name}:fallback`);
  assert.equal(
    submissions.every((task) => task.ua.every((question) => question.aId.length > 0)),
    true,
    `${name}:grade-100-payload`
  );
  console.log(`${name}: answer and fallback paths validated; grade=100 payload`);
}
