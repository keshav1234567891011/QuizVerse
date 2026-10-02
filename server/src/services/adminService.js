import mongoose from "mongoose";
import User from "../models/User.js";
import Quiz from "../models/Quiz.js";
import Group from "../models/Group.js";
import Assignment from "../models/Assignment.js";
import Attempt from "../models/Attempt.js";
import Notification from "../models/Notification.js";
import GroupMessage from "../models/GroupMessage.js";
import { fail, identifier, setGroupStatus } from "./groupService.js";
import { resourceReference, referenceFilter } from "./adminReferenceService.js";
import { validateQuizContent } from "./questionService.js";
import { assignmentView, analytics, resultView } from "./assignmentService.js";

export const requireAdmin = user => { if (user?.role !== "admin" || user.accountStatus === "suspended") fail(403, "Administrator access required."); };
const personFields = "name email publicId role accountStatus createdAt updatedAt";
const quizFields = "publicId title description creator category difficulty status moderationState visibility timerMode totalTimeLimit questions._id createdAt updatedAt";
const attemptFields = "publicId assignment quiz user attemptNumber status score totalMarks percentage correctAnswers totalQuestions startedAt submittedAt timeTakenSeconds review";
const identity = row => row ? { publicId: row.publicId || null, name: row.name, role: row.role } : null;
export const userView = row => ({ ...identity(row), email: row.email, accountStatus: row.accountStatus || "active", createdAt: row.createdAt, updatedAt: row.updatedAt });
export const quizView = row => ({ reference: resourceReference(row), title: row.title, description: row.description, category: row.category, difficulty: row.difficulty,
  status: row.status, moderationState: row.moderationState || "active", visibility: row.visibility, questionCount: row.questions?.length || 0,
  creator: identity(row.creator), createdAt: row.createdAt, updatedAt: row.updatedAt });
export const groupView = row => ({ groupCode: row.groupCode, name: row.name, description: row.description, status: row.status,
  teacher: identity(row.teacher), memberCount: row.students?.length || 0, createdAt: row.createdAt, updatedAt: row.updatedAt });
export const assignmentAdminView = row => ({ ...assignmentView(row), teacher: identity(row.teacher), quiz: row.quiz ? { reference: resourceReference(row.quiz), title: row.quiz.title } : null,
  classroomExists: !!row.group, classroomStatus: row.group?.status || null });
export const attemptView = row => ({ ...resultView(row), reference: resourceReference(row), student: identity(row.user),
  quiz: row.quiz ? { reference: resourceReference(row.quiz), title: row.quiz.title } : null,
  assignment: row.assignment ? { token: row.assignment.shareToken, title: row.assignment.title, group: row.assignment.groupSnapshot } : null });

export function listSettings(query = {}) {
  const page = query.page === undefined ? 1 : Number(query.page), limit = query.limit === undefined ? 20 : Number(query.limit);
  if (!Number.isInteger(page) || page < 1 || page > 10000 || !Number.isInteger(limit) || limit < 1 || limit > 50) fail(400, "Invalid pagination.");
  if (query.search !== undefined && (typeof query.search !== "string" || query.search.length > 100)) fail(400, "Search must be text up to 100 characters.");
  const search = query.search?.trim();
  return { page, limit, skip: (page - 1) * limit, search: search ? new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null };
}
function enumFilter(query, name, allowed) {
  if (query[name] === undefined || query[name] === "") return undefined;
  if (!allowed.includes(query[name])) fail(400, `Invalid ${name} filter.`);
  return query[name];
}
async function pageOf(Model, filter, settings, fields, populate, view) {
  let request = Model.find(filter).select(fields).sort({ createdAt: -1, _id: -1 }).skip(settings.skip).limit(settings.limit);
  for (const [path, select] of populate) request = request.populate(path, select);
  const [rows, total] = await Promise.all([request.lean(), Model.countDocuments(filter)]);
  return { items: rows.map(view), total, page: settings.page, limit: settings.limit, pages: Math.ceil(total / settings.limit) };
}
const missing = (row, label) => { if (!row) fail(404, `${label} not found.`); return row; };
const assignmentPopulate = [["teacher", "name publicId role"], ["quiz", "title publicId"], ["group", "status"]];
const attemptPopulate = [["user", "name publicId role"], ["quiz", "title publicId"], ["assignment", "shareToken title groupSnapshot"]];
export async function dashboard(user) {
  requireAdmin(user);
  const [totalUsers, students, teachers, admins, suspendedUsers, totalQuizzes, publishedQuizzes, groups, activeGroups, assignments, attempts, submittedAttempts, notifications, messages, recentUsers, recentQuizzes, recentAssignments] = await Promise.all([
    User.countDocuments({}), User.countDocuments({ role: "student" }), User.countDocuments({ role: "teacher" }), User.countDocuments({ role: "admin" }), User.countDocuments({ accountStatus: "suspended" }),
    Quiz.countDocuments({}), Quiz.countDocuments({ status: "published", moderationState: { $ne: "restricted" } }), Group.countDocuments({}), Group.countDocuments({ status: "active" }), Assignment.countDocuments({}),
    Attempt.countDocuments({}), Attempt.countDocuments({ status: "submitted" }), Notification.countDocuments({}), GroupMessage.countDocuments({}),
    User.find({}).select(personFields).sort({ createdAt: -1, _id: -1 }).limit(5).lean(),
    Quiz.find({}).select(quizFields).populate("creator", "name publicId role").sort({ createdAt: -1, _id: -1 }).limit(5).lean(),
    Assignment.find({}).select("title shareToken groupSnapshot status opensAt dueAt attemptLimit publishedAt assignedStudents createdAt").sort({ createdAt: -1, _id: -1 }).limit(5).lean(),
  ]);
  return { metrics: { totalUsers, students, teachers, admins, suspendedUsers, activeUsers: totalUsers - suspendedUsers, totalQuizzes, publishedQuizzes, groups, activeGroups, archivedGroups: groups - activeGroups,
    assignments, attempts, submittedAttempts, inProgressAttempts: attempts - submittedAttempts, notifications, messages },
    recent: { users: recentUsers.map(userView), quizzes: recentQuizzes.map(quizView), assignments: recentAssignments.map(assignmentView) } };
}
export async function users(user, query) {
  requireAdmin(user); const settings = listSettings(query), filter = {};
  const role = enumFilter(query, "role", ["student", "teacher", "admin"]), status = enumFilter(query, "status", ["active", "suspended"]);
  if (role) filter.role = role;
  if (status) filter.accountStatus = status === "active" ? { $ne: "suspended" } : status;
  if (settings.search) filter.$or = ["name", "email", "publicId"].map(field => ({ [field]: settings.search }));
  return pageOf(User, filter, settings, personFields, [], userView);
}
export async function userDetails(user, publicId) {
  requireAdmin(user); const row = missing(await User.findOne({ publicId: identifier(publicId, "QV") }).select(personFields).lean(), "User");
  const [memberships, ownedGroups, ownedQuizzes, ownedAssignments, attempts] = await Promise.all([Group.countDocuments({ students: row._id }), Group.countDocuments({ teacher: row._id }), Quiz.countDocuments({ creator: row._id }), Assignment.countDocuments({ teacher: row._id }), Attempt.countDocuments({ user: row._id })]);
  return { user: userView(row), counts: { memberships, ownedGroups, ownedQuizzes, ownedAssignments, attempts } };
}
export async function changeUser(user, publicId, field, value) {
  requireAdmin(user);
  if ((field === "role" && !["student", "teacher"].includes(value)) || (field === "accountStatus" && !["active", "suspended"].includes(value)) || !["role", "accountStatus"].includes(field)) fail(400, "Invalid account change.");
  return mongoose.connection.transaction(async session => {
    const row = missing(await User.findOne({ publicId: identifier(publicId, "QV") }).select(personFields).session(session).lean(), "User");
    if (row.role === "admin" || String(row._id) === String(user._id)) fail(403, "Admin accounts cannot be changed through this interface.");
    if (field === "role" && row.role === "teacher" && value === "student") {
      // Run session operations sequentially; MongoDB transactions do not support
      // parallel operations on the same session.
      const classroom = await Group.exists({ teacher: row._id, status: "active" }).session(session);
      const assignment = await Assignment.exists({ teacher: row._id, status: { $in: ["draft", "published"] } }).session(session);
      const quiz = await Quiz.exists({ creator: row._id, status: "published", moderationState: { $ne: "restricted" } }).session(session);
      if (classroom || assignment || quiz) fail(409, "Archive active classrooms, close assignments and unpublish quizzes before changing this teacher to a student.");
    }
    const changed = await User.findOneAndUpdate({ _id: row._id, role: row.role, accountStatus: row.accountStatus === undefined ? { $exists: false } : row.accountStatus }, { $set: { [field]: value } }, { new: true, runValidators: true, session }).select(personFields).lean();
    if (!changed) fail(409, "This account changed. Refresh and try again.");
    return userView(changed);
  });
}
export async function quizzes(user, query) {
  requireAdmin(user); const settings = listSettings(query), filter = {};
  for (const [key, values] of [["status", ["draft", "published"]], ["visibility", ["public", "private", "unlisted"]], ["moderationState", ["active", "restricted"]]]) {
    const value = enumFilter(query, key, values); if (value) filter[key] = key === "moderationState" && value === "active" ? { $ne: "restricted" } : value;
  }
  if (settings.search) filter.$or = [{ title: settings.search }, { category: settings.search }];
  return pageOf(Quiz, filter, settings, quizFields, [["creator", "name publicId role"]], quizView);
}
export async function quizDetails(user, reference) {
  requireAdmin(user); const row = missing(await Quiz.findOne(referenceFilter(reference)).select(quizFields).populate("creator", "name publicId role").lean(), "Quiz");
  const [assignments, attempts] = await Promise.all([Assignment.countDocuments({ quiz: row._id }), Attempt.countDocuments({ quiz: row._id })]);
  return { quiz: quizView(row), counts: { assignments, attempts } };
}
export async function moderateQuiz(user, reference, action) {
  requireAdmin(user); if (!["publish", "restrict", "restore", "unpublish"].includes(action)) fail(400, "Invalid moderation action.");
  return mongoose.connection.transaction(async session => {
    const quiz = missing(await Quiz.findOne(referenceFilter(reference)).session(session), "Quiz");
    if (action === "publish") {
      if (quiz.moderationState === "restricted") fail(409, "Restore this quiz before publishing.");
      const creator = await User.findById(quiz.creator).select("role").session(session).lean();
      if (!creator || !["teacher", "admin"].includes(creator.role)) fail(409, "Restore the creator's teaching role before publishing this quiz.");
      validateQuizContent({ ...quiz.toObject(), status: "published" });
    }
    if (action === "restore" && quiz.moderationState !== "restricted") fail(409, "This quiz is not restricted.");
    quiz.status = action === "publish" ? "published" : "draft";
    if (action === "restrict") quiz.moderationState = "restricted";
    if (action === "restore") quiz.moderationState = "active";
    await quiz.save({ session });
    const row = await Quiz.findById(quiz._id).select(quizFields).populate("creator", "name publicId role").session(session).lean();
    return quizView(row);
  });
}
export async function groups(user, query) {
  requireAdmin(user); const settings = listSettings(query), filter = {};
  let searchTruncated = false;
  const status = enumFilter(query, "status", ["active", "archived"]); if (status) filter.status = status;
  if (settings.search) {
    const teachers = await User.find({ $or: [{ name: settings.search }, { email: settings.search }, { publicId: settings.search }] }).select("_id").sort({ _id: 1 }).limit(101).lean();
    searchTruncated = teachers.length > 100;
    filter.$or = [{ name: settings.search }, { groupCode: settings.search }, { teacher: { $in: teachers.slice(0, 100).map(t => t._id) } }];
  }
  return { ...await pageOf(Group, filter, settings, "groupCode name description teacher students status createdAt updatedAt", [["teacher", "name publicId role"]], groupView), searchTruncated };
}
export async function groupDetails(user, code, query = {}) {
  requireAdmin(user); const row = missing(await Group.findOne({ groupCode: identifier(code, "GRP") }).select("groupCode name description teacher students status createdAt updatedAt").populate("teacher", "name publicId role").lean(), "Classroom");
  return { group: groupView(row), assignments: await assignments(user, { ...query, groupCode: code }) };
}
export async function archiveGroup(user, code, status) { requireAdmin(user); return setGroupStatus(user, code, status); }
export async function assignments(user, query) {
  requireAdmin(user); const settings = listSettings(query), filter = {}, now = new Date();
  const state = enumFilter(query, "state", ["draft", "upcoming", "open", "overdue", "closed"]);
  if (state === "draft" || state === "closed") filter.status = state;
  else if (state) {
    filter.status = "published";
    if (state === "overdue") filter.dueAt = { $lte: now, $ne: null };
    else { filter.$and = [{ $or: [{ dueAt: null }, { dueAt: { $gt: now } }] }, state === "upcoming" ? { opensAt: { $gt: now } } : { $or: [{ opensAt: null }, { opensAt: { $lte: now } }] }]; }
  }
  if (query.groupCode) filter["groupSnapshot.groupCode"] = identifier(query.groupCode, "GRP");
  if (settings.search) filter.$or = ["title", "groupSnapshot.name", "groupSnapshot.groupCode", "shareToken"].map(key => ({ [key]: settings.search }));
  return pageOf(Assignment, filter, settings, "title shareToken group groupSnapshot teacher quiz status opensAt dueAt attemptLimit publishedAt assignedStudents createdAt", assignmentPopulate, assignmentAdminView);
}
async function assigned(token) {
  if (typeof token !== "string" || !/^[a-f0-9]{48}$/.test(token)) fail(400, "Invalid assignment token.");
  return missing(await Assignment.findOne({ shareToken: token }).select("title shareToken group groupSnapshot teacher quiz status opensAt dueAt attemptLimit publishedAt assignedStudents createdAt").lean(), "Assignment");
}
export async function assignmentDetails(user, token) {
  requireAdmin(user); const row = await assigned(token);
  const populated = await Assignment.populate(row, assignmentPopulate.map(([path, select]) => ({ path, select })));
  return assignmentAdminView(populated);
}
export async function assignmentReport(user, token) {
  requireAdmin(user); const row = await assigned(token);
  // Existing report logic and frozen roster; no parallel scoring or analytics.
  const rows = await Attempt.find({ assignment: row._id }).select(attemptFields).lean();
  return analytics(row, rows);
}
export async function attempts(user, query) {
  requireAdmin(user); const settings = listSettings(query), filter = {};
  let searchTruncated = false;
  const status = enumFilter(query, "status", ["in-progress", "submitted"]); if (status) filter.status = status;
  const kind = enumFilter(query, "kind", ["standalone", "assignment"]); if (kind) filter.assignment = kind === "standalone" ? null : { $ne: null };
  if (query.studentPublicId) { const student = await User.findOne({ publicId: identifier(query.studentPublicId, "QV") }).select("_id").lean(); filter.user = student?._id || null; }
  if (query.assignmentToken) {
    if (kind === "standalone") fail(400, "A standalone filter cannot specify an assignment.");
    filter.assignment = (await assigned(query.assignmentToken))._id;
  }
  if (query.from || query.to) {
    filter.startedAt = {};
    for (const [key, operator] of [["from", "$gte"], ["to", "$lte"]]) if (query[key]) {
      if (typeof query[key] !== "string") fail(400, "Invalid date filter.");
      const date = new Date(query[key]); if (Number.isNaN(date.getTime())) fail(400, "Invalid date filter.");
      filter.startedAt[operator] = date;
    }
    if (filter.startedAt.$gte && filter.startedAt.$lte && filter.startedAt.$gte > filter.startedAt.$lte) fail(400, "Start date must precede end date.");
  }
  if (settings.search) {
    const students = await User.find({ $or: [{ name: settings.search }, { publicId: settings.search }] }).select("_id").sort({ _id: 1 }).limit(101).lean();
    searchTruncated = students.length > 100;
    filter.$or = [{ user: { $in: students.slice(0, 100).map(s => s._id) } }, { publicId: settings.search }];
  }
  return { ...await pageOf(Attempt, filter, settings, attemptFields.replace(" review", ""), attemptPopulate, attemptView), searchTruncated };
}
export async function attemptDetails(user, reference) {
  requireAdmin(user); let request = Attempt.findOne(referenceFilter(reference)).select(attemptFields);
  for (const [path, fields] of attemptPopulate) request = request.populate(path, fields);
  return attemptView(missing(await request.lean(), "Attempt"));
}
