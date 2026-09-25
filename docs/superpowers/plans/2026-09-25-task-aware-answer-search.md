# Task-Aware Answer Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand bounded answer search so unmarked task types use matching, ordering, table, and payload-layout candidates instead of one generic fallback.

**Architecture:** Keep marked-answer extraction and current full-lesson submission. Add pure candidate-generation helpers in `lib/test-parser.js`; `index.js` tries each candidate through existing `SaveUserTestV1`, checks `marks[].m`, caches successful payloads, and stops at 10,000 candidates per task. Candidate layouts include merged `qId: "1"` and original question IDs.

**Tech Stack:** Node.js ESM, existing Axios client, Node `assert` tests, no new dependencies.

**Spec:** Approved chat design on 2026-09-25.

## Global Constraints

- Do not submit lessons whose Test node Grade is already `100`.
- Do not exceed `10,000` candidate submissions per task.
- Preserve current marked-answer behavior (`c`, `ca`).
- Keep answer search bounded; no infinite retry loop.
- Existing parser and CLI tests must continue passing.

---

### Task 1: Candidate generation primitives

**Files:**
- Modify: `lib/test-parser.js`
- Test: `tests/parser-fallback.test.js`

**Interfaces:**
- Produces `buildTaskCandidates(task, practiceItem, maxCandidates = 10000) -> submission[]`.
- Each submission has `{ iId, iCode, iType, ua }`.
- `ua` entries have `{ qId, aId }`; `aId` contains `[groupId, answerId]` pairs.

- [ ] **Step 1: Write failing tests**

Add assertions for pure candidate generation:

```js
const task = { id: 7, code: "candidate-task", type: 7 };
const practice = { i: { q: [{ id: "q1", al: [
  { id: 1, a: [{ id: 11 }, { id: 12 }] },
  { id: 2, a: [{ id: 21 }, { id: 22 }] },
] }] } };
const candidates = buildTaskCandidates(task, practice, 10000);
assert.ok(candidates.length > 1);
assert.ok(candidates.every(({ iId, iCode, iType }) =>
  iId === 7 && iCode === "candidate-task" && iType === 7));
assert.ok(candidates.some(({ ua }) =>
  ua.some(({ aId }) => JSON.stringify(aId) === JSON.stringify([[1, 11]]))));
```

Add cap assertion:

```js
assert.equal(buildTaskCandidates(task, practice, 3).length, 3);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:parser-fallback`
Expected: FAIL because current generator does not provide task-aware candidate coverage.

- [ ] **Step 3: Implement minimal candidate generation**

In `lib/test-parser.js`:

1. Normalize all `practiceItem.data.i.q`, `practiceItem.i.q`, and `practiceItem.q` shapes.
2. Preserve each question's `id` and group list.
3. Build candidate choices per group from nonzero answer IDs.
4. For type `7`, generate one-answer-per-group combinations plus one-to-one permutations when group and answer counts match.
5. For type `56`, generate permutations of answer IDs across ordered groups.
6. For type `1`, generate single-answer and non-empty subset choices per group.
7. For type `23` and unknown types, generate non-empty per-group choices.
8. Emit both merged `qId: "1"` candidates and candidates retaining original question IDs when questions have distinct IDs.
9. Stop generation at `maxCandidates`; return `[]` when a group has no usable answer IDs.

Use small local helpers only. Do not add dependencies.

- [ ] **Step 4: Run tests to verify candidate coverage**

Run: `npm run test:parser-fallback && npm run test:parser-all`
Expected: PASS; existing fallback payload assertions remain unchanged.

- [ ] **Step 5: Commit**

```bash
git add lib/test-parser.js tests/parser-fallback.test.js
git commit -m "feat: generate task-aware answer candidates\n\nCo-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Task 2: Oracle search integration

**Files:**
- Modify: `index.js:1-4, 14-18, 198-260`
- Test: `tests/parser-dry-run.test.js`

**Interfaces:**
- Consumes `buildTaskCandidates` from Task 1.
- Uses existing `EngDis.SaveUserTestV1(nodeId, parentNodeId, submissions)`.
- Uses response `data.marks[]` entries `{ iId, m }`.
- Produces final lesson submission after replacing each failed task with its passing candidate.

- [ ] **Step 1: Write failing integration test**

Extend the fake `EngDis` in `tests/parser-dry-run.test.js` with a mark oracle:

```js
const marks = new Map([[7, 0]]);
const saveCalls = [];
const fakeSave = async (_nodeId, _parentNodeId, submissions) => {
  saveCalls.push(submissions);
  const task = submissions.find(({ iId }) => iId === 7);
  const passed = task?.ua.some(({ aId }) =>
    JSON.stringify(aId) === JSON.stringify([[1, 12], [2, 22]]));
  return { isSuccess: true, data: {
    marks: [{ iId: 7, m: passed ? 100 : 0 }],
    finalMark: passed ? 100 : 0,
  } };
};
```

Assert search stops after first passing candidate and final payload contains passing candidate. Keep existing assertion that dry-run mode never calls the real network client.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:parser`
Expected: FAIL because `setTest100Percent` does not replace failed task payloads using mark feedback in the fake flow.

- [ ] **Step 3: Implement mark-driven search**

In `index.js`:

1. Import `buildTaskCandidates`.
2. Keep `practiceByCode` while fetching task practice data.
3. Submit current full lesson once.
4. Read `marks[].m` by matching numeric `iId`.
5. For each task not marked `100`, generate candidates with cap `10000`.
6. For each candidate, resubmit full lesson with only that task replaced.
7. Stop task search on `Number(taskMark) === 100`.
8. Cache passing candidate by task code for later retry passes.
9. Log candidate count, solved task, or exhausted task.
10. Submit final assembled lesson once.
11. Retain clipboard output only when final mark is not `100`.

Do not add unbounded loops. Do not search tasks already marked `100`.

- [ ] **Step 4: Run tests**

Run: `npm run test:parser && npm run test:parser-fallback && npm run test:parser-all && npm run test:cli-input`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.js tests/parser-dry-run.test.js
git commit -m "feat: use task marks as bounded answer oracle\n\nCo-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Task 3: Live verification and safety checks

**Files:**
- Modify: none unless tests expose defects.
- Test: live sandbox run with existing credentials.

- [ ] **Step 1: Run static checks**

Run:

```bash
npm run test:parser
npm run test:parser-fallback
npm run test:parser-all
npm run test:cli-input
node --check index.js
node --check lib/test-parser.js
git diff --check
```

Expected: all commands pass.

- [ ] **Step 2: Run bounded sandbox search**

Run with authorized sandbox credentials:

```bash
printf 'fe1\\n69070120\\ny\\n' | node index.js
```

Observe:
- Completed Test nodes log `skip completed lesson`.
- Candidate search logs never exceed `10000` per task.
- Each solved task logs `solved <code>`.
- Final output reports `Progress: 100 Grade: 100` when portal accepts generated candidates.

- [ ] **Step 3: Record unresolved cases**

If any task remains below `100`, preserve its task code and candidate count in output. Do not claim guaranteed completion; portal may reject all generated payload layouts or require hidden answer state.

- [ ] **Step 4: Commit only verified code changes**

```bash
git status --short
git diff --check
```

Do not commit credentials, tokens, generated logs, or clipboard payloads.
