import mongoose from "mongoose";
import Assignment from "../models/Assignment.js";
import Attempt from "../models/Attempt.js";
import Group from "../models/Group.js";
import Quiz from "../models/Quiz.js";
import User from "../models/User.js";
import { fail, identifier, canManage, lockGroup } from "./groupService.js";
import { gradeAnswers } from "./scoringService.js";

const same = (a, b) => String(a?._id || a) === String(b?._id || b);
export function token(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{48}$/.test(value)) fail(400, "Invalid assignment link.");
  return value;
}
export function assignmentState(a, now = new Date()) {
  if (a.status !== "published") return a.status;
  if (a.dueAt && now >= new Date(a.dueAt)) return "overdue";
  if (a.opensAt && now < new Date(a.opensAt)) return "upcoming";
  return "open";
}
export function manager(a, group, user) {
  return user.role === "admin" || (user.role === "teacher" &&
    (group ? canManage(group, user) : same(a.teacher, user._id)));
}
export function eligible(a, group, user, now = new Date()) {
  if (user.role !== "student" || !group || group.status !== "active" ||
    !group.students.some(id => same(id, user._id)) ||
    !a.assignedStudents.some(s => same(s.user, user._id))) fail(403, "You are not assigned to this classroom activity.");
  if (assignmentState(a, now) !== "open") fail(403, "This assignment is not open.");
}
export function assignmentView(a, now = new Date()) {
  return { token: a.shareToken, title: a.title, group: a.groupSnapshot,
    state: assignmentState(a, now), status: a.status, opensAt: a.opensAt,
    dueAt: a.dueAt, attemptLimit: a.attemptLimit, publishedAt: a.publishedAt,
    assignedCount: a.assignedStudents.length, createdAt: a.createdAt };
}
export function playableQuiz(snapshot) {
  return { title: snapshot.title, description: snapshot.description, category: snapshot.category,
    difficulty: snapshot.difficulty, timerMode: snapshot.timerMode, totalTimeLimit: snapshot.totalTimeLimit,
    questions: snapshot.questions.map((q, index) => ({ key: String(index), questionText: q.questionText,
      options: [...q.options], marks: q.marks, timeLimit: q.timeLimit })) };
}
function settings(body, current = {}) {
  const readDate = (name) => {
    if (body[name] === undefined) return current[name] || null;
    if (body[name] === null || body[name] === "") return null;
    const date = new Date(body[name]);
    if (Number.isNaN(date.getTime())) fail(400, `Invalid ${name}.`);
    return date;
  };
  const opensAt = readDate("opensAt"), dueAt = readDate("dueAt");
  const attemptLimit = body.attemptLimit === undefined ? current.attemptLimit || 1 : Number(body.attemptLimit);
  if (!Number.isInteger(attemptLimit) || attemptLimit < 1 || attemptLimit > 100) fail(400, "Attempt limit must be between 1 and 100.");
  if (opensAt && dueAt && dueAt <= opensAt) fail(400, "Due time must follow opening time.");
  return { opensAt, dueAt, attemptLimit };
}
// Membership and assignment mutations lock the classroom first. Transaction
// retries serialize quota checks with concurrent starts and membership changes.
export async function withAssignment(value, callback) {
  token(value);
  return mongoose.connection.transaction(async session => {
    const original = await Assignment.findOne({ shareToken: value }).select("+quizSnapshot").session(session);
    if (!original) fail(404, "Assignment not found.");
    const existing = await Group.findById(original.group).session(session);
    const group = existing ? await lockGroup(existing.groupCode, session) : null;
    const a = await Assignment.findOneAndUpdate({ _id: original._id }, { $inc: { revision: 1 } },
      { new: true, session }).select("+quizSnapshot");
    return callback(a, group, session);
  });
}
export async function createAssignment(user, body = {}) {
  if (!["teacher", "admin"].includes(user.role)) fail(403, "Only teachers and admins can create assignments.");
  const code = identifier(body.groupCode, "GRP");
  if (!mongoose.Types.ObjectId.isValid(body.quizId)) fail(400, "Choose a valid quiz.");
  const dates = settings(body);
  return mongoose.connection.transaction(async session => {
    const group = await lockGroup(code, session);
    if (!canManage(group, user)) fail(403, "You cannot assign work to this classroom.");
    const quiz = await Quiz.findById(body.quizId).session(session);
    if (!quiz) fail(404, "Quiz not found.");
    if (user.role !== "admin" && !same(quiz.creator, user._id)) fail(403, "Choose one of your own quizzes.");
    const [a] = await Assignment.create([{ quiz: quiz._id, group: group._id, teacher: group.teacher,
      createdBy: user._id, title: quiz.title, groupSnapshot: { name: group.name, groupCode: group.groupCode }, ...dates }], { session });
    return assignmentView(a);
  });
}
export async function updateAssignment(user, value, body = {}) {
  return withAssignment(value, async (a, group, session) => {
    if (!manager(a, group, user)) fail(403, "You cannot manage this assignment.");
    if (!group) fail(409, "Classroom no longer exists; assignment is read-only.");
    const next = settings(body, a);
    const started = await Attempt.exists({ assignment: a._id }).session(session);
    if (started && (String(next.opensAt) !== String(a.opensAt) || next.attemptLimit < a.attemptLimit ||
      (!a.dueAt && next.dueAt) || (a.dueAt && next.dueAt && next.dueAt < a.dueAt))) {
      fail(409, "After attempts start, only extend the due time or increase the attempt limit.");
    }
    Object.assign(a, next);
    const action = body.action;
    if (action !== undefined && !["publish", "close", "reopen"].includes(action)) fail(400, "Invalid assignment action.");
    if (action === "publish") {
      if (a.status !== "draft") fail(409, "Assignment has already been published.");
      const quiz = await Quiz.findById(a.quiz).session(session);
      if (!quiz || quiz.status !== "published" || !quiz.questions.length) fail(409, "Publish a quiz with questions first.");
      if (user.role !== "admin" && !same(quiz.creator, user._id)) fail(403, "You no longer own this quiz.");
      const valid = quiz.questions.every(q => q.options.length >= 2 && Number.isInteger(q.correctOption) &&
        q.correctOption >= 0 && q.correctOption < q.options.length && q.marks > 0 && q.timeLimit >= 5);
      if (!valid || (quiz.timerMode === "whole-quiz" && !(quiz.totalTimeLimit > 0))) fail(400, "Quiz questions or timer settings are invalid.");
      const students = await User.find({ _id: { $in: group.students }, role: "student" }).session(session);
      if (students.some(s => !s.publicId)) fail(409, "Every assigned student needs a QuizVerse ID.");
      a.assignedStudents = students.map(s => ({ user: s._id, name: s.name, publicId: s.publicId }));
      a.quizSnapshot = { title: quiz.title, description: quiz.description, category: quiz.category, difficulty: quiz.difficulty,
        timerMode: quiz.timerMode, totalTimeLimit: quiz.totalTimeLimit,
        questions: quiz.questions.map(q => ({ _id: q._id, questionText: q.questionText, options: [...q.options],
          correctOption: q.correctOption, marks: q.marks, timeLimit: q.timeLimit })) };
      a.title = quiz.title;
      a.status = "published";
      a.publishedAt = new Date();
    } else if (action === "close") {
      if (!a.publishedAt) fail(409, "Publish the assignment before closing it.");
      a.status = "closed";
    } else if (action === "reopen") {
      if (a.status !== "closed" || !a.publishedAt) fail(409, "Only a published closed assignment can be reopened.");
      a.status = "published";
    }
    await a.save({ session });
    return assignmentView(a);
  });
}
export function analytics(a, attempts) {
  const rows = a.assignedStudents.map(student => {
    const own = attempts.filter(attempt => same(attempt.assignment, a._id) && same(attempt.user, student.user));
    const submitted = own.filter(x => x.status === "submitted").sort((x, y) =>
      new Date(y.submittedAt) - new Date(x.submittedAt) || y.attemptNumber - x.attemptNumber);
    return { publicId: student.publicId, name: student.name, attemptCount: own.length,
      completedCount: submitted.length, bestScore: submitted.length ? Math.max(...submitted.map(x => x.percentage)) : null,
      latestScore: submitted[0]?.percentage ?? null,
      results: submitted.map(resultView) };
  });
  const completed = rows.filter(r => r.completedCount), attempted = rows.filter(r => r.attemptCount);
  return { assignedStudents: rows.length, attemptedStudents: attempted.length, completedStudents: completed.length,
    completionPercentage: rows.length ? Number((completed.length / rows.length * 100).toFixed(2)) : 0,
    averageScore: completed.length ? Number((completed.reduce((n, r) => n + r.bestScore, 0) / completed.length).toFixed(2)) : 0,
    rows };
}
export function resultView(attempt) {
  return { publicId: attempt.publicId, attemptNumber: attempt.attemptNumber, status: attempt.status,
    score: attempt.score, totalMarks: attempt.totalMarks, percentage: attempt.percentage,
    correctAnswers: attempt.correctAnswers, totalQuestions: attempt.totalQuestions,
    startedAt: attempt.startedAt, submittedAt: attempt.submittedAt, timeTakenSeconds: attempt.timeTakenSeconds };
}
export function syncProgress(attempt, snapshot, now = new Date()) {
  if (snapshot.timerMode !== "per-question") return;
  while (attempt.currentQuestionIndex < snapshot.questions.length && attempt.questionClosesAt && now >= new Date(attempt.questionClosesAt)) {
    const opened = new Date(attempt.questionClosesAt);
    attempt.currentQuestionIndex += 1;
    attempt.questionOpenedAt = opened;
    attempt.questionClosesAt = attempt.currentQuestionIndex < snapshot.questions.length
      ? new Date(opened.getTime() + snapshot.questions[attempt.currentQuestionIndex].timeLimit * 1000) : null;
  }
}
export function sessionView(attempt, a, now = new Date()) {
  syncProgress(attempt, a.quizSnapshot, now);
  return { publicId: attempt.publicId, status: attempt.status, attemptNumber: attempt.attemptNumber,
    serverNow: now, expiresAt: attempt.expiresAt, dueAt: a.dueAt,
    currentQuestionIndex: attempt.currentQuestionIndex, questionClosesAt: attempt.questionClosesAt,
    answers: attempt.answers.map(answer => ({ key: String(a.quizSnapshot.questions.findIndex(q => same(q._id, answer.questionId))), selectedOption: answer.selectedOption })),
    quiz: playableQuiz(a.quizSnapshot) };
}
export async function startAssignedAttempt(user, value) {
  return withAssignment(value, async (a, group, session) => {
    const now = new Date();
    eligible(a, group, user, now);
    const active = await Attempt.findOne({ assignment: a._id, user: user._id, status: "in-progress" }).session(session);
    if (active) return sessionView(active, a, now);
    const count = await Attempt.countDocuments({ assignment: a._id, user: user._id }).session(session);
    if (count >= a.attemptLimit) fail(409, "You have reached this assignment's attempt limit.");
    const q = a.quizSnapshot;
    const seconds = q.timerMode === "whole-quiz" ? q.totalTimeLimit : q.timerMode === "per-question"
      ? q.questions.reduce((n, question) => n + question.timeLimit, 0) : null;
    const [attempt] = await Attempt.create([{ assignment: a._id, quiz: a.quiz, user: user._id,
      attemptNumber: count + 1, startedAt: now, totalMarks: q.questions.reduce((n, question) => n + question.marks, 0),
      totalQuestions: q.questions.length, expiresAt: seconds ? new Date(now.getTime() + seconds * 1000) : null,
      questionOpenedAt: q.timerMode === "per-question" ? now : null,
      questionClosesAt: q.timerMode === "per-question" ? new Date(now.getTime() + q.questions[0].timeLimit * 1000) : null }], { session });
    return sessionView(attempt, a, now);
  });
}
export async function mutateAssignedAttempt(user, publicId, action, body = {}) {
  if (typeof publicId !== "string" || !/^[a-f0-9-]{36}$/.test(publicId)) fail(400, "Invalid attempt reference.");
  const reference = await Attempt.findOne({ publicId });
  if (!reference?.assignment) fail(404, "Assignment attempt not found.");
  const original = await Assignment.findById(reference.assignment);
  if (!original) fail(404, "Assignment no longer exists.");
  return withAssignment(original.shareToken, async (a, group, session) => {
    const attempt = await Attempt.findOne({ publicId }).session(session);
    if (!same(attempt.user, user._id)) fail(403, "Only the intended student can use this attempt.");
    const now = new Date();
    eligible(a, group, user, now);
    if (attempt.status !== "in-progress") fail(409, "This attempt is already finished.");
    syncProgress(attempt, a.quizSnapshot, now);
    if (action === "answer" || action === "advance") {
      if (attempt.expiresAt && now >= attempt.expiresAt) fail(409, "Attempt timer has ended. Submit your saved answers.");
      if (typeof body.key !== "string" || !/^(0|[1-9]\d*)$/.test(body.key)) fail(400, "Invalid question.");
      const index = Number(body.key), question = a.quizSnapshot.questions[index];
      if (!Number.isInteger(index) || !question) fail(400, "Invalid question.");
      if (a.quizSnapshot.timerMode === "per-question" && index !== attempt.currentQuestionIndex) fail(409, "This question's time window has ended.");
      if (action === "answer") {
        const selected = body.selectedOption;
        if (selected !== null && (!Number.isInteger(selected) || selected < 0 || selected >= question.options.length)) fail(400, "Invalid option.");
        const saved = attempt.answers.find(x => same(x.questionId, question._id));
        if (saved) saved.selectedOption = selected;
        else attempt.answers.push({ questionId: question._id, selectedOption: selected });
      } else {
        if (a.quizSnapshot.timerMode !== "per-question") fail(400, "This quiz does not use question windows.");
        attempt.currentQuestionIndex += 1;
        attempt.questionOpenedAt = now;
        const next = a.quizSnapshot.questions[attempt.currentQuestionIndex];
        attempt.questionClosesAt = next ? new Date(now.getTime() + next.timeLimit * 1000) : null;
      }
    } else if (action === "submit") {
      Object.assign(attempt, gradeAnswers(a.quizSnapshot.questions, attempt.answers));
      attempt.status = "submitted";
      attempt.submittedAt = now;
      attempt.timeTakenSeconds = Math.max(0, Math.round((now - attempt.startedAt) / 1000));
    } else fail(400, "Invalid attempt action.");
    await attempt.save({ session });
    return action === "submit" ? { ...resultView(attempt), assignment: assignmentView(a), quiz: { title: a.title } } : sessionView(attempt, a, now);
  });
}
