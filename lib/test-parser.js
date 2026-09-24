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

export function flattenAnswerLists(questions) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return [];
  }

  return questions.flatMap((question) => (
    Array.isArray(question?.al) ? question.al : []
  ));
}

export function selectCorrectAnswers(questions) {
  return flattenAnswerLists(questions).map((answerGroup) => {
    if (!isObject(answerGroup) || answerGroup.id === undefined || !Array.isArray(answerGroup.a)) {
      throw new TypeError("answer group must contain id and answer array");
    }

    const correct = answerGroup.a.find((answer) => String(answer?.c) === "1");
    if (!correct || correct.id === undefined) {
      throw new TypeError(`answer group ${answerGroup.id} has no correct answer`);
    }

    return [answerGroup.id, correct.id];
  });
}

export function buildDryRunSubmission(lesson, practiceByCode) {
  const tasks = getTestTasks(lesson);
  if (tasks.length === 0) {
    throw new TypeError("lesson contains no test tasks");
  }

  return tasks.map((task) => {
    if (!isObject(task) || task.id === undefined || !task.code || task.type === undefined) {
      throw new TypeError("test task must contain id, code, and type");
    }

    const practice = practiceByCode[task.code];
    const questions = practice?.i?.q;
    const aId = selectCorrectAnswers(questions);
    if (aId.length === 0) {
      throw new TypeError(`practice item ${task.code} contains no answer groups`);
    }

    return {
      iId: task.id,
      iCode: task.code,
      iType: task.type,
      ua: [{ qId: 1, aId }],
    };
  });
}
