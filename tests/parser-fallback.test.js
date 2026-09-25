import assert from "node:assert/strict";
import {
  buildTaskCandidates,
  buildTaskSubmission,
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
assert.equal(candidates.length, 3);
assert.deepEqual(candidates[0].ua, [
  { qId: "1", aId: [[1, 11]] },
  { qId: "1", aId: [[2, 21]] },
]);
console.log("parser-fallback: synthetic fallback and candidate search validated");
