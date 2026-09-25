function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseLessonSource(source) {
  if (typeof source !== "string") {
    throw new TypeError("lesson source must be a string");
  }

  const json = source
    .trim()
    .replace(/^﻿?\s*var\s+lesson\s*=\s*/, "")
    .replace(/;\s*$/, "");

  const lesson = JSON.parse(json);
  if (!isObject(lesson) || !Array.isArray(lesson.steps)) {
    throw new TypeError("lesson must contain a steps array");
  }

  return lesson;
}

export function getTestTasks(lesson) {
  if (!isObject(lesson) || !Array.isArray(lesson.steps)) {
    throw new TypeError("lesson must contain a steps array");
  }

  return lesson.steps
    .filter((step) => String(step.id) === "3" || String(step.name).toLowerCase() === "test")
    .flatMap((step) => (Array.isArray(step.tasks) ? step.tasks : []));
}

export function extractQuestionAnswers(question, qIndex = 0, options = {}) {
  if (!isObject(question)) return null;

  const qId = question.id !== undefined ? question.id : qIndex + 1;
  const groups = Array.isArray(question.al) ? question.al : [];
  const aId = [];

  for (const group of groups) {
    if (!isObject(group) || group.id === undefined) continue;

    const answers = Array.isArray(group.a) ? group.a : [];
    let correct = answers.filter(
      (ans) => String(ans?.c) === "1" || ans?.c === 1 || ans?.c === true
    );

    if (correct.length === 0 && group.ca !== undefined) {
      correct = [
        answers.find((ans) => String(ans?.id) === String(group.ca)) || {
          id: group.ca,
        },
      ];
    }

    if (correct.length === 0 && options.allowFirstAnswerFallback && answers.length > 0) {
      correct = [answers[0]];
    }

    for (const answer of correct) {
      if (answer?.id !== undefined) {
        aId.push([group.id, answer.id]);
      }
    }
  }

  return aId.length > 0 ? { qId, aId } : null;
}

export function selectCorrectAnswers(questions) {
  if (!Array.isArray(questions) || questions.length === 0) return [];
  const uaList = questions
    .map((q, idx) => extractQuestionAnswers(q, idx))
    .filter(Boolean);
  return uaList.flatMap((item) => item.aId);
}

export function findTaskMark(marks, taskId) {
  if (!Array.isArray(marks)) return undefined;
  return marks.find((mark) => String(mark?.iId) === String(taskId))?.m;
}

export function getTaskScore(response, taskId) {
  const mark = findTaskMark(response?.data?.marks, taskId);
  return mark === undefined ? -1 : Number(mark);
}

function getQuestions(practiceItem) {
  return (
    practiceItem?.data?.i?.q ??
    practiceItem?.i?.q ??
    (Array.isArray(practiceItem?.q) ? practiceItem.q : null)
  );
}

function getTaskGroups(practiceItem) {
  const questions = getQuestions(practiceItem);
  if (!Array.isArray(questions)) return null;

  return questions.flatMap((question, questionIndex) => {
    const qId = question?.id !== undefined ? question.id : questionIndex + 1;
    return (Array.isArray(question?.al) ? question.al : [])
      .filter((group) => group?.id !== undefined && group.id !== 0)
      .map((group) => ({ group, qId }));
  });
}

function answerOptions(group) {
  const answers = Array.isArray(group?.a) ? group.a : [];
  return answers.filter((answer) => answer?.id !== undefined && answer.id !== 0);
}

function* choiceSets(answers, includeSubsets) {
  for (const answer of answers) yield [answer];
  if (!includeSubsets || answers.length > 10) return;

  for (let mask = 1; mask < 2 ** answers.length; mask++) {
    const subset = answers.filter((_, index) => (mask & 2 ** index) !== 0);
    if (subset.length > 1) yield subset;
  }
}

function* permutations(items) {
  if (items.length < 2) {
    yield items;
    return;
  }
  for (let index = 0; index < items.length; index++) {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of permutations(rest)) yield [items[index], ...tail];
  }
}

function* candidateLayouts(selected, taskType) {
  const pairs = selected.flatMap(({ group, answers }) =>
    answers.map((answer) => [group.id, answer.id])
  );
  const orderedPairs = taskType === "56" ? permutations(pairs) : [pairs];

  for (const ordered of orderedPairs) {
    yield [{ qId: "1", aId: ordered }];
    yield selected.map(({ group, answers }) => ({
      qId: "1",
      aId: answers.map((answer) => [group.id, answer.id]),
    }));

    const questionIds = [...new Set(selected.map((entry) => String(entry.qId)))];
    if (questionIds.length > 1) {
      yield questionIds.map((qId) => ({
        qId,
        aId: selected
          .filter((entry) => String(entry.qId) === qId)
          .flatMap(({ group, answers }) =>
            answers.map((answer) => [group.id, answer.id])
          ),
      }));
    }
  }
}

export function* iterateTaskCandidates(task, practiceItem) {
  if (!isObject(task) || task.id === undefined || !task.code || task.type === undefined) {
    throw new TypeError("test task must contain id, code, and type");
  }

  const groups = getTaskGroups(practiceItem);
  if (!groups?.length) return;
  const taskType = String(task.type);
  const choices = groups.map(({ group }) =>
    [...choiceSets(answerOptions(group), taskType === "1")]
  );
  if (choices.some((groupChoices) => groupChoices.length === 0)) return;

  const seen = new Set();
  function* visit(groupIndex, selected) {
    if (groupIndex === groups.length) {
      for (const ua of candidateLayouts(selected, taskType)) {
        const candidate = { iId: task.id, iCode: task.code, iType: task.type, ua };
        const key = JSON.stringify(candidate);
        if (!seen.has(key)) {
          seen.add(key);
          yield candidate;
        }
      }
      return;
    }

    const group = groups[groupIndex];
    for (const answers of choices[groupIndex]) {
      yield* visit(groupIndex + 1, [...selected, { ...group, answers }]);
    }
  }

  yield* visit(0, []);
}

export function buildTaskCandidates(task, practiceItem, maxCandidates = 10000) {
  if (!isObject(task) || task.id === undefined || !task.code || task.type === undefined) {
    throw new TypeError("test task must contain id, code, and type");
  }
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1) return [];
  const candidates = [];
  for (const candidate of iterateTaskCandidates(task, practiceItem)) {
    candidates.push(candidate);
    if (candidates.length >= maxCandidates) break;
  }
  return candidates;
}

export function buildTaskSubmission(task, practiceItem, options = {}) {
  if (!isObject(task) || task.id === undefined || !task.code || task.type === undefined) {
    throw new TypeError("test task must contain id, code, and type");
  }

  const questions =
    practiceItem?.data?.i?.q ??
    practiceItem?.i?.q ??
    (Array.isArray(practiceItem?.q) ? practiceItem.q : null);

  if (!Array.isArray(questions)) {
    return null;
  }

  // Teacher's grade-100 trick: merge all answer groups into q[0]
  // so every answer ends up under qId: 1
  const questionsCopy = questions.map((q) => ({
    ...q,
    al: Array.isArray(q.al) ? [...q.al] : [],
  }));
  if (questionsCopy.length > 1) {
    const first = questionsCopy[0];
    for (let i = 1; i < questionsCopy.length; i++) {
      if (Array.isArray(questionsCopy[i]?.al)) {
        first.al = [...first.al, ...questionsCopy[i].al];
      }
    }
    questionsCopy.length = 1;
  }

  const question = questionsCopy[0];
  const groups = Array.isArray(question?.al) ? question.al : [];
  const hasExplicitAnswer = groups.some(
    (group) =>
      group?.ca !== undefined ||
      group?.a?.some(
        (answer) =>
          String(answer?.c) === "1" || answer?.c === 1 || answer?.c === true
      )
  );

  // Teacher's fallback sends one qId:1 entry per answer group.
  const fallbackGroups = [...groups]
    .filter((group) => group?.id !== 0)
    .sort((left, right) => Number(left?.id) - Number(right?.id));
  const taskType = String(task.type);
  const ua =
    options.allowFirstAnswerFallback && !hasExplicitAnswer
      ? fallbackGroups
          .map((group) => {
            const answers = Array.isArray(group?.a) ? group.a : [];
            if (group?.id === undefined || answers.length === 0) return null;
            const candidates = answers.filter((answer) => answer?.id !== undefined && answer.id !== 0);
            if (candidates.length === 0) return null;

            if (taskType === "7") {
              const selected = candidates.at(-1);
              return { qId: "1", aId: [[group.id, selected.id]] };
            }

            if (taskType === "1") {
              return {
                qId: "1",
                aId: candidates.map((answer) => [group.id, answer.id]),
              };
            }

            const selected = candidates[0];
            return { qId: "1", aId: [[group.id, selected.id]] };
          })
          .filter((entry) => entry && entry.aId.length > 0)
      : questionsCopy
          .map((q, idx) => extractQuestionAnswers(q, idx, options))
          .filter(Boolean);

  if (ua.length === 0) {
    return null;
  }

  return {
    iId: task.id,
    iCode: task.code,
    iType: task.type,
    ua,
  };
}

export function buildDryRunSubmission(lesson, practiceByCode) {
  const tasks = getTestTasks(lesson);
  if (tasks.length === 0) {
    throw new TypeError("lesson contains no test tasks");
  }

  return tasks
    .map((task) => buildTaskSubmission(task, practiceByCode[task.code]))
    .filter(Boolean);
}
