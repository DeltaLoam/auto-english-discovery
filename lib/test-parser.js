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
    let correct = answers.find(
      (ans) => String(ans?.c) === "1" || ans?.c === 1 || ans?.c === true
    );

    if (!correct && group.ca !== undefined) {
      correct = answers.find((ans) => String(ans?.id) === String(group.ca)) || { id: group.ca };
    }

    if (!correct && options.allowFirstAnswerFallback && answers.length > 0) {
      correct = answers[0];
    }

    if (correct && correct.id !== undefined) {
      aId.push([group.id, correct.id]);
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
  const ua =
    options.allowFirstAnswerFallback && !hasExplicitAnswer
      ? groups
          .map((group) => {
            const answers = Array.isArray(group?.a) ? group.a : [];
            if (group?.id === undefined || answers.length === 0) return null;
            return { qId: "1", aId: [[group.id, answers[0].id]] };
          })
          .filter((entry) => entry && entry.aId.every(([, answerId]) => answerId !== undefined))
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
