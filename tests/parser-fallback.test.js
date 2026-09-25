import assert from "node:assert/strict";
import {
  buildTaskCandidates,
  buildTaskSubmission,
  getTaskScore,
  iterateTaskCandidates,
} from "../lib/test-parser.js";

const task = { id: 7, code: "fallback-task", type: 23 };
const practice = {
  i: {
    q: [
      {
        id: 1,
        al: [
          { id: 1, a: [{ id: 11 }, { id: 12 }] },
          { id: 2, a: [{ id: 21 }] },
        ],
      },
    ],
  },
};

const submission = buildTaskSubmission(task, practice, {
  allowFirstAnswerFallback: true,
});
assert.deepEqual(submission, {
  iId: 7,
  iCode: "fallback-task",
  iType: 23,
  ua: [
    { qId: "1", aId: [[1, 11]] },
    { qId: "1", aId: [[2, 21]] },
  ],
});
const candidates = buildTaskCandidates(task, practice, 10000);
assert.ok(candidates.length > 3);
assert.deepEqual(candidates[0].ua, [{ qId: "1", aId: [[1, 11], [2, 21]] }]);
assert.equal(getTaskScore({ data: { marks: [{ iId: "7", m: 100 }] } }, 7), 100);
assert.equal(getTaskScore({ data: { finalMark: 97 } }, 7), -1);
const lazyCandidates = [...iterateTaskCandidates(task, practice)];
assert.deepEqual(lazyCandidates, candidates);

const matchingTask = { id: 8, code: "matching-task", type: 7 };
const matchingPractice = {
  i: {
    q: [{
      al: [
        { id: 1, a: [{ id: 11 }, { id: 12 }] },
        { id: 2, a: [{ id: 21 }, { id: 22 }] },
      ],
    }],
  },
};
const matchingCandidates = [...iterateTaskCandidates(matchingTask, matchingPractice)];
assert.deepEqual(matchingCandidates.at(-1).ua, [
  { qId: "1", aId: [[1, 11], [1, 12], [2, 21], [2, 22]] },
]);
console.log("parser-fallback: synthetic fallback and candidate search validated");
