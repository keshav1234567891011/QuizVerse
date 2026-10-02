# QuizVerse

React/Vite frontend and Express/Mongoose API, using MongoDB Atlas and JWT authentication in httpOnly cookies.

## Local development

Use Node.js 24 (the runtime used for Branch 4 verification). Install dependencies separately in the root, `client`, and `server` when setting up a fresh checkout. Copy `client/.env.example` and `server/.env.example` to `.env` in their respective directories, then populate the server's `MONGO_URI` and a strong `JWT_SECRET` locally. Never commit populated environment files.

- `CLIENT_URL`: exact frontend origin, usually `http://localhost:5173`.
- `VITE_API_URL`: backend origin, usually `http://localhost:5000`; embedded at frontend build time.
- `PORT`: API port, default `5000`.
- `NODE_ENV`: use `production` for secure authentication cookies when hosting over HTTPS.

Run `npm run dev` at the root. Production API startup is `npm start --prefix server`. This repository does not yet include a production hosting configuration; a frontend host must route SPA paths back to `index.html`. Independently hosted domains require cookie/CORS testing.

## Branch 4 classroom behavior

Students can attempt quizzes and request classroom membership. Teachers can manage their own quizzes and classrooms. Admins can manage all quizzes/classrooms. Public registration permits only student and teacher accounts.

Invitations and join requests share `GroupInvitation`, with a `kind` distinguishing the flow. A partial unique index allows only one pending request per classroom/student pair, across both kinds. Creating a request does not add membership. Only the invited student may answer an invitation; only the owning teacher or an admin may answer a join request. Acceptance uses `$addToSet`; decline leaves membership unchanged. Classroom deletion cancels pending requests.

Membership mutations run in MongoDB transactions and write the classroom revision first to serialize competing membership changes. MongoDB must support transactions (Atlas or a replica set). Startup waits for classroom/request indexes before accepting traffic.

All classroom operations use `GRP-XXXXXXXX`, `QV-XXXXXXXX`, and public request UUIDs. Identity responses exclude internal MongoDB user IDs. Existing quiz/attempt API IDs remain internal resource references, never displayed as user identity.

Branch 5 adds classroom assignments and assignment-specific progress reports as described below. Existing standalone quiz timer issues from the audit remain separate follow-up work.

## Branch 5 assignments and analytics

A quiz is reusable content. An assignment delivers that quiz to exactly one classroom. Teachers choose an existing quiz and an active classroom they own; admins may choose any teaching resource. Students cannot create or manage assignments. Private quizzes can be delivered securely through assignments without becoming publicly playable.

Draft assignments have an opaque share token, opening time, due time, and an integer attempt limit of 1–100. Publishing requires a published quiz with valid questions and timer settings. Publication freezes the quiz content (including the server-only answer key) and the assigned student roster with their names and QV IDs. Editing, unpublishing, or deleting the source quiz does not change assignment grading. The same quiz can be assigned to multiple groups; each assignment has separate attempts and analytics.

Stored states are `draft`, `published`, and `closed`. The backend derives `upcoming`, `open`, and `overdue` from the published assignment's opening and due times. Opening is inclusive; the due boundary is exclusive. Teachers can close and reopen published assignments. Once any attempt starts, settings may only extend/remove the due time or raise the attempt limit; the opening time stays fixed.

Students discover published assignments through their current classroom membership and the frozen publication roster. Students joining later are not eligible for older assignments. Removing a student blocks further starts, answer updates, and submission, while preserving their historical results and analytics row. Deleting a classroom closes its published assignments without deleting attempts. Historical analytics remain available to the original teacher/admin, and saved personal results remain available to their owner.

Share links use `/a/:token` and require authentication. Login returns to the requested internal URL. Assignment attempt/result URLs use random UUIDs. New assignment responses never expose MongoDB identifiers or correct answers. Existing standalone resource routes retain compatibility.

Assignments reuse the `Attempt` model and a shared server-side grading service. Starting/resuming uses the same active attempt without consuming an extra slot. Each new attempt consumes one slot, including unfinished attempts. Answers save on the server as options are selected. Assignment submissions grade only saved responses; posted answer arrays, scores, and correctness flags cannot override grading. Whole-quiz and per-question windows use server timestamps; refreshing does not reset them. After a quiz timer ends, saved on-time responses can still be finalized while the assignment is open. Passing the assignment due time or closing it denies submission. The client tries to auto-submit before the due time; network failures or suspended tabs can leave an unfinished attempt that still consumes a slot.

Availability, current membership, frozen-roster eligibility, role, and attempt limits are checked on the backend. Mutations lock the classroom then the assignment in a MongoDB transaction, using the same lock order as membership operations. A unique assignment/user/attempt-number index provides an additional quota safeguard. An Atlas/replica-set database with transaction support is required.

Analytics use only the frozen roster and attempts referencing that exact assignment. Attempted students have any started attempt; completed students have at least one submitted attempt. Completion percentage uses the full published roster. Average score is the mean of completed students' best percentages (zero when none are complete). Each row includes QV ID, name, attempt count, completed count, best score, latest score, and individual score/time summaries. Empty rosters produce zero metrics without division errors.

### Assignment APIs and pages

- `GET /api/assignments`: assignments visible to the authenticated role.
- `POST /api/assignments`: create a draft using `quizId`, `groupCode`, optional `opensAt`/`dueAt`, and `attemptLimit`.
- `GET /api/assignments/:token`: role-authorized details and the student's own attempt history.
- `PATCH /api/assignments/:token`: settings and optional `action: publish | close | reopen`.
- `GET /api/assignments/:token/analytics`: authorized classroom teacher/admin report.
- `POST /api/assignments/:token/start`: start or resume an eligible student's attempt.
- `GET /api/assignment-attempts/:publicId`: owner-only safe session or saved result.
- `PUT /api/assignment-attempts/:publicId/answer`: save a question's public index `key` and `selectedOption`.
- `POST /api/assignment-attempts/:publicId/advance`: close the current per-question window.
- `POST /api/assignment-attempts/:publicId/submit`: grade stored answers and persist the result.

Frontend pages are `/assignments`, `/assignments/create`, `/a/:token`, `/a/:token/play`, and `/assignment-attempts/:publicId/result`. Dashboard, classroom cards, navigation, and My Attempts link into these pages.

### Compatibility and database rollout

No data migration or existing-attempt backfill is required. Legacy attempts have no assignment and continue using the existing standalone routes. Assignment attempts receive a public UUID and reference an immutable published snapshot. New schema fields are additive. Startup initializes Assignment and Attempt indexes before listening; allow the normal server startup to finish index creation during an approved deployment. No migration or database startup is performed by local verification.

### Branch 5 local verification

```powershell
$env:TEST_MONGO_URI = ''
$env:RUN_ASSIGNMENT_MONGO_TESTS = ''
npm test --prefix server -- '--test-name-pattern=^(?!MongoDB)'
npm run lint --prefix client
npm run build --prefix client -- --configLoader native
$verificationFiles = rg --files server/src server/test server/test-support -g '*.js'
foreach ($verificationFile in $verificationFiles) {
  node --check $verificationFile
  if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $verificationFile" }
}
git diff --check
git --no-optional-locks status --untracked-files=all
```

Assignment service tests use transaction doubles, and route tests run only an ephemeral loopback HTTP server with database methods mocked. They cover the complete delivery flow, isolation for two groups sharing one quiz, ownership/admin access, student/nonmember denial, token authorization, availability, limits, snapshot grading, answer-key filtering, and standalone compatibility. Real MongoDB behavior is not proven by these doubles. The optional Branch 5 integration test additionally requires `RUN_ASSIGNMENT_MONGO_TESTS=1` and a separately approved `TEST_MONGO_URI`; it uses only a randomly named `quizverse_branch5_test_*` database and never falls back to `MONGO_URI`. Keep it disabled until an isolated test database is explicitly approved.

### Branch 5 manual browser checks

Use teacher A, teacher B, admin, student A, student B, and an outsider in separate profiles in your chosen development/test environment.

1. Teacher A creates classrooms A and B, with student A in A and student B in B. Create and publish one quiz; a private quiz is suitable for checking secure classroom delivery.
2. Create assignment A for classroom A and assignment B for classroom B from that same quiz. Confirm both begin as drafts and are invisible to students. Publish both; copy their different `/a/:token` links.
3. Student A sees only A; student B sees only B. Open the A link while signed out, sign in as student A, and confirm return to A. Open it as student B or the outsider: access must be denied.
4. Student A starts A, selects an answer, and refreshes. Start/resume should show the same attempt number and saved answer. Submit and reload the saved result; check the assignment/classroom label and My Attempts link.
5. Teacher A views A analytics: one assigned/attempted/completed student, 100% completion, correct score and attempt count. B must still show no completed students. Complete B as student B and confirm its results stay separate.
6. Edit the original quiz's text, answer key, and marks after publication. Start another allowed assignment attempt: old content and original grading must remain. Unpublish/delete the source quiz; the published assignment must still work.
7. Set opening time in the future, verify upcoming state and denied start, then test at/after opening. Set a short due time and confirm overdue state blocks new starts, answer updates, and submissions. Close and reopen a published assignment and repeat the access checks.
8. Set attempt limit 1, submit once, then try another start. Raise the limit to 2, complete a second attempt, and verify counts plus best/latest score. After attempts start, shortening the due time, changing opening time, or reducing the limit must fail.
9. Repeat an assignment with whole-quiz and per-question timers. Refresh mid-attempt; the timer must continue. Per-question mode must deny answering earlier/future windows. Whole-quiz expiry must reject new selections and grade only previously saved answers.
10. Remove student A after publication: further attempt operations must fail while saved results and the analytics row remain. Add a new student after publication: the old assignment must remain inaccessible to that student. Delete a classroom: its assignment closes and historical analytics/results remain accessible to their authorized owners.
11. Teacher B cannot manage A or see its analytics. Admin can manage/view it. Student requests to POST/PATCH assignments or GET analytics must fail even when sent manually in browser developer tools.
12. Inspect every assignment/session/result response: no `correctOption`, frozen answer key, or MongoDB identifiers. Inject a client score/replacement answer array into submission: the result must use only saved server-side selections.
13. Recheck standalone public/unlisted quiz play, scoring, history/result reload, quiz CRUD, authentication/logout, invitations and join requests. Check assignments, tables, forms, and mobile navigation at desktop and 360px widths.

## Branch 6 notifications and classroom messaging

Authenticated users have a recipient-isolated inbox at `/notifications`, an unread navigation badge, an unread filter, cursor pagination, and individual/all-read actions. Notification UUIDs, QV IDs, classroom codes, assignment tokens, and message UUIDs are the only identifiers returned by the new APIs. Actor and sender displays are snapshots; messages render as plain text.

Notification producers cover invitations, invitation responses, join requests and responses, assignment publication, due-soon reminders, announcements, membership removal, and classroom deletion. Recipients are selected by the server. Each recipient/event pair has a unique index; retries do not create another notification or reset its read state. Writes share the source operation's transaction, so notification failure rolls back the source mutation rather than reporting a misleading event. Assignment publication uses the frozen assigned-student roster.

Classroom chat is `/groups/:code/chat`. Current student members, the owning teacher, and admins can read/send; other teachers and outsiders cannot. Only the owner/admin may announce. Archived classrooms remain readable but reject writes. Deleted classrooms reject chat access; historical records are retained internally without exposing deleted chat. Membership removal blocks subsequent chat requests. Changing a former student's role does not grant access as a different teacher.

Messages require a client-generated UUID retry key, scoped to sender/classroom. Reusing it with identical content returns the original message; different content fails. Message history has cursor pagination and incremental polling. Announcements notify classroom students and the owner, excluding the actor. The database counts recent messages under the existing classroom transaction lock: at most 20 new messages per sender/classroom in a rolling minute, shared across server instances. Identical retries do not consume another slot. This serializes classroom writes and is suitable for modest traffic; production hardening should include request-level distributed limits, retention rules, abuse controls, and load testing.

REST polling refreshes notification synchronization/count every 60 seconds and chat every 15 seconds while authenticated/visible. It prevents overlapping requests, stops polling in hidden tabs, and aborts outstanding requests when leaving the session/page. There are no new packages or realtime infrastructure. Notification list contents can be refreshed manually; the badge refreshes automatically.

Due soon means a published assignment with a deadline strictly in the future and within 24 hours (inclusive). Authenticated student synchronization only considers current active-classroom members on the frozen assignment roster, excluding students who already submitted. A deadline-specific event key prevents duplicates and permits a new reminder after a deadline change. **Reminders are not guaranteed while users are offline:** there is no background scheduler. Synchronization processes eligible assignments individually and may need batching for large accounts.

### Communication APIs

- `GET /api/notifications?unread=true&before=:uuid&limit=30`: own inbox, newest first.
- `GET /api/notifications/unread-count`: own unread count.
- `PATCH /api/notifications/:publicId/read`: own notification, idempotent.
- `PATCH /api/notifications/read-all`: mark current own notifications read.
- `POST /api/notifications/sync`: synchronize eligible due reminders.
- `GET /api/groups/:code/messages?before=:uuid&limit=30`: classroom history; alternatively use `after=:uuid` for incremental updates.
- `POST /api/groups/:code/messages`: `{ message, type: normal | announcement, clientMessageId: UUID }`.

No migration/backfill is required. Startup initializes Notification and GroupMessage indexes alongside existing indexes before serving traffic. Transactions still require Atlas/a replica set. Local verification does not start the database-connected API. Optional Branch 6 concurrency tests additionally require `RUN_COMMUNICATIONS_MONGO_TESTS=1` and an explicitly approved isolated `TEST_MONGO_URI`; they use a random `quizverse_branch6_test_*` database. Keep all real-database tests disabled during ordinary verification:

```powershell
$env:TEST_MONGO_URI = ''
$env:RUN_ASSIGNMENT_MONGO_TESTS = ''
$env:RUN_COMMUNICATIONS_MONGO_TESTS = ''
npm test --prefix server -- '--test-name-pattern=^(?!MongoDB)'
npm run lint --prefix client
npm run build --prefix client -- --configLoader native
$verificationFiles = rg --files server/src server/test server/test-support -g '*.js'
foreach ($verificationFile in $verificationFiles) {
  node --check $verificationFile
  if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $verificationFile" }
}
git diff --check
git --no-optional-locks status --untracked-files=all
```

### Branch 6 browser smoke tests

Use two teachers, an admin, two students in different classrooms, and an outsider in your approved test environment.

1. The owning teacher posts an announcement in classroom A. Its student receives exactly one unread notification; classroom B's student and the outsider receive none. Open the notification into A chat. Reload to confirm message persistence.
2. Exchange normal messages as the teacher and student. Confirm sender name, QV ID, role, timestamp, and mobile layout. Text such as `<script>alert(1)</script>` must appear literally, without executing.
3. As the student, manually POST an announcement; expect 403. Teacher B and the outsider must receive 403 for reading/sending A messages; the admin may read/send and announce. Signed-out requests must fail authentication.
4. Replay a POST with its original `clientMessageId` and body: only one message/announcement notification should exist. Change its body while retaining the UUID: expect 409. Send more than 20 distinct messages in one minute: expect 429; wait a minute and retry. Load older history with more than 30 messages; inspect classroom isolation.
5. Invite a student, then accept/decline from that student profile. Repeat with join requests accepted/declined by teacher/admin. Check correct recipients and no membership before acceptance. Publish an assignment: only its frozen roster receives the publication notice, with the correct `/a/:token` link.
6. Publish assignments due inside 24 hours, beyond 24 hours, already overdue, and with a completed attempt. Use Notifications Refresh or wait for synchronization: only the eligible future incomplete assignment should remind. Refresh repeatedly: no duplicates. Closed, archived, and removed-member cases must not produce new reminders.
7. Mark one notification read, use Unread only, mark all read, and paginate. Reload; read state persists. Try another account's notification UUID in mark-read/pagination: access must fail. Inspect all new API responses for internal IDs/answer keys.
8. Archive a classroom in an approved test setup: history stays readable and posting fails. Remove a member: their chat access fails. Delete a classroom: chat fails for everyone, including admin; affected users receive activity notices. Existing saved assignment results remain usable.
9. Hide the tab: polling stops. Return: refresh resumes. Logout and sign in as another user: the prior inbox/count/chat must disappear. Simulate an API/network failure, check errors, then recover using Refresh/Retry. Confirm retrying a message after an uncertain response does not duplicate it.
10. Recheck Branch 4 invitations/join flows and Branch 5 assignment play, frozen grading, isolated analytics, standalone quiz play/results, quiz CRUD, and authentication. Check navigation/inbox/chat at desktop and 360px mobile width.

Unit/service/HTTP tests use transaction doubles and a loopback HTTP server with database methods mocked. They verify authorization, recipient isolation, read state, retry behavior, source-event rollback, reminder boundaries, and Branch 4/5 regressions. Real MongoDB locking/index/concurrency behavior remains unverified until the opt-in isolated-database test is approved and run.

## Branch 7 advanced question builder

Quiz questions support `singleChoice`, `multipleSelect`, `trueFalse`, `shortAnswer`, `numeric`, and `fillBlank`. Questions and frozen snapshots without `questionType` remain single choice. Shared question schemas retain `questionText`, stable internal `_id`, existing per-question `marks` (default 1), and `timeLimit` (default 30 seconds). Existing category/difficulty fields were already correct in the current checkout and are unchanged.

Type-specific grading configuration is server-only:

| Type | Configuration | Full-credit rule |
| --- | --- | --- |
| singleChoice | options, correctOption | Exact valid option index |
| multipleSelect | options, correctOptions | Exact unordered set; duplicate/invalid indexes rejected |
| trueFalse | correctBoolean | Exact boolean; false is an answer |
| shortAnswer | acceptedAnswers, caseSensitive | Trim outer whitespace, then exact accepted-answer match; default case insensitive |
| numeric | correctNumber, numericTolerance | Finite decimal/scientific input; absolute difference at most tolerance, inclusive; default tolerance 0 |
| fillBlank | blanks with acceptedAnswers and caseSensitive | Every blank must match for full question credit |

Fill-blank prompts use `{{1}}`, `{{2}}`, etc., each exactly once with consecutive numbering. Blank editors must match these markers; removing a blank requires updating prompt numbering. There is no partial credit, fuzzy matching, regex matching, internal-whitespace collapsing, or new scoring-weight system. Existing marks and percentage calculation remain intact. Numeric comparisons use JavaScript finite numbers and their floating-point precision; decimal differences near a tolerance boundary can reflect that precision. No epsilon secretly widens a configured tolerance.

Create and Edit Quiz share QuestionEditor: add/remove/reorder questions, dynamic type controls, add/remove options, accepted alternatives, case settings, tolerance, blanks, existing marks/timers, and inline validation. Changing type drops obsolete grading fields both in the client and backend. Existing question IDs survive edits/reordering; supplied duplicate or foreign IDs are rejected. New IDs are generated by the server. Choice labels may repeat for legacy compatibility; answer indexes, not label text, determine correctness.

The existing Attempt model and shared grader are reused. New standalone attempts save a server-only quiz snapshot at start and play the safe content returned by that same request. Editing/deleting the source quiz cannot change these attempts' grading. Legacy standalone in-progress attempts without snapshots use the previous live-quiz fallback; their original content cannot be reconstructed. No standalone resume or timer redesign was introduced.

Published assignment snapshots freeze all types and grading configuration. Membership, opening/due times, quotas, timer windows, classroom transactions, and assignment analytics retain their existing enforcement. Choice/boolean answers save immediately, preserving the existing single-choice behavior. Written responses use explicit Save answer and save before previous/next/submit. Text, numeric and blank drafts remain local until saved. Refresh resumes server-saved answers. A failed save blocks normal navigation/submission and shows an error. Save before the timer ends: after expiry only previously saved responses can be graded; expired unsaved changes are not silently reported as saved.

### Compatible payload extensions and results

Existing quiz/attempt/assignment endpoint paths are unchanged. Author-only quiz create/edit requests include `questionType` and its configuration. Playable responses include type, prompt, options where applicable, `blankCount` for fillBlank, marks, timing, and existing resource references. They exclude all grading keys, accepted answers, correct booleans/numbers, tolerance, and case settings. Assignment responses continue using public question-index keys and opaque assignment/attempt links.

Standalone submission remains `{ answers: [{ questionId, ...typedAnswer }] }`. Assignment answer saving remains `{ key, ...typedAnswer }`. The typed field is exactly one of `selectedOption`, `selectedOptions`, `booleanAnswer`, `textAnswer`, `numericAnswer`, or `blankAnswers`. Null clears an answer; empty multiple selections/text/blank values receive no credit. Numeric zero and boolean false are valid answered values. Numeric input rejects hexadecimal, nonfinite numbers, trailing units, objects, and boolean coercion. Answer identity, indexes, shape, length and type are checked on the backend; posted scores and correctness never influence grading.

New submitted attempts persist safe question review: public display index, prompt/type, student's answer, correct/incorrect/unanswered state, and earned/available marks. Correct-answer keys remain hidden even after submission. Review is not returned for in-progress attempts. Old records without historical review keep their saved aggregate results; no current question content is substituted as a supposedly historical prompt. No migration, backfill, packages, cloud services, or new routes are required.

### Branch 7 verification and browser smoke tests

Use the Branch 6 local verification commands above with all MongoDB opt-ins cleared. New tests cover mixed-type HTTP quiz delivery/results, both frozen grading paths after source edits, stable IDs, validation and answer filtering, exact-set grading, case matching, numeric boundaries, false/zero/empty responses, per-blank rules, and legacy behavior. The full Branch 4/5/6 regression suite remains included. Actual MongoDB integration and browser automation are not part of these local checks.

1. As a teacher, create a public quiz with all six types. Configure multipleSelect with two answers, trueFalse with false, shortAnswer with two alternatives, numeric with correct value 0 and tolerance 0.25, and fillBlank with two numbered markers and different case settings. Save draft, reload/edit, publish, and verify metadata.
2. Add/remove options and accepted answers. Move questions up/down, save and reload; confirm existing `_id` values remain unchanged in the authorized edit response. Switch a question type and inspect the saved record: obsolete key fields must be absent.
3. Try missing answer keys, duplicate selected/key indexes, invalid numeric/tolerance, empty alternatives, malformed blank markers, and duplicate/foreign question IDs through developer tools. Expect 400 responses. Student creation/edit requests must receive 403.
4. Play standalone as a student. Select multiple choices in reverse order, choose false, type padded/case-varied short text, enter zero, and complete both blanks. Submit and reload results: original marks, safe question review, false/zero displays, and persistent history must be correct.
5. Repeat with partial/extra multiple selections, incorrect case on a sensitive blank, numeric values exactly at/outside tolerance, and cleared text/selections. Confirm exact-set/all-blank full-credit rules and unanswered states without partial credit.
6. Start a standalone attempt; edit/reorder/change keys or delete its source quiz as teacher. Complete the open attempt: the start snapshot's content and grading must remain. A legacy historical result must still show its original aggregate score.
7. Assign the mixed quiz to two different classrooms and publish both. Edit source prompts/types/keys/marks afterward. Each student must play original frozen content; saved results and analytics must remain isolated per assignment.
8. Save each typed assignment response, refresh, and resume. Confirm false, zero, arrays and text persist. Previous/next/submit must save pending changes first. Simulate failed saves: remain on the question with an error and retained draft; recover and retry.
9. Test no timer, whole-quiz and per-question assignment modes. Save before expiry, then let a window expire with an unsaved draft: no late answer may be accepted, and submission must still grade saved answers. Recheck opening/due/closed/quota/nonmember denials.
10. Inspect playable, start/resume, history and result responses: no grading configuration or full snapshots, even after submission. Recheck quiz browsing, old single-choice editing/play, groups, notifications, messaging, login/logout, and mobile builder/player/results at 360px width.

## Existing-account migration

Back up the database and stop the API before running migrations. Use the intended environment's `server/.env` and an existing account email for the admin. From the repository root:

```powershell
npm run backfill:public-ids --prefix server
npm run migrate:roles --prefix server -- owner@example.com
```

The public-ID backfill assigns only missing IDs, preserves existing IDs, retries duplicate-key collisions, and creates user indexes after the backfill. The role migration runs atomically: legacy `user` accounts that own quizzes become teachers, remaining legacy `user` accounts become students, and the specified existing account becomes admin. Existing student/teacher/admin assignments are preserved except for the explicit admin promotion. Reruns do not overwrite public IDs or demote existing roles. A missing admin account aborts without changing roles.

Restart the API, verify legacy accounts and indexes, then sign in as student, teacher, and admin. Migrations are CLI-only and must never be exposed as public endpoints. Fresh installations do not need a public-ID backfill; the CLI is also the mechanism for assigning the first admin to an already registered account.

## Checks

```powershell
npm test
npm run lint
npm run build
git diff --check
```

Default tests cover classroom services, request authorization, role restrictions, registration/login/cookie behavior, playable answer-key filtering, server-side grading, personal attempt results/history, and migrations using test doubles. They do not connect to the application database or prove MongoDB transaction behavior.

The opt-in MongoDB integration test exercises concurrent invitation/join creation and concurrent acceptance against an actual replica set. Set `TEST_MONGO_URI` to a dedicated test cluster/replica-set URI in your shell and run `npm test`. It creates an isolated randomly named `quizverse_branch4_test_*` database and removes that database afterward. Test credentials must allow creation/indexing/transactions and cleanup of that isolated database. It never reads `MONGO_URI` as a fallback.

## Manual browser verification

Use separate browser profiles for teacher A, teacher B, student A, student B, and the migrated admin.

1. Visit Home at desktop and 360px mobile widths. Check all three CTAs, feature sections, sample preview, and How QuizVerse Works. Confirm no horizontal overflow.
2. Open each role CTA. Confirm the corresponding registration card is selected. Use Tab, arrow keys, and Space to change roles; confirm only student/teacher are available. Register both account types.
3. Sign in, reload, and confirm the session persists. Confirm student/teacher/admin dashboard labels and navigation differ. Sign out and confirm protected pages redirect to login. On mobile, check menu open/close, links, and Escape returning focus to its toggle.
4. Teacher A creates a classroom. Confirm teacher public ID, group code, zero members, and empty states. Invite student A by their dashboard QV ID; confirm membership remains zero and the request is pending.
5. Student A sees the invitation; student B does not. Decline it, verify zero members, then re-invite and accept. Reload both profiles: member count must be exactly one. Repeated invitation or join request must report an existing member, without duplicates.
6. Student B requests to join using the classroom code. Confirm no immediate membership. Teacher A sees the request; teacher B cannot manage that classroom. Decline once, request again, then accept; confirm exactly two members. Admin may review join requests, but cannot accept invitations on behalf of students.
7. With a pending invitation, also try a join request for the same student/classroom pair (and vice versa). Confirm a clear duplicate-pending error. Try invalid codes/IDs and invitations to teachers.
8. Verify pending/accepted/declined/all filters, member removal, then reinvitation. Delete a classroom containing a pending request; confirm it becomes cancelled and cannot be accepted. Reload to check persistence.
9. Use browser Network tools to take the classroom API offline: check loading/error/retry states and recovery. After a saved action whose refresh fails, further actions should stay disabled until Refresh succeeds.
10. As a teacher, create/edit/publish/unpublish/delete quizzes. Confirm students cannot open creator pages or successfully call creator APIs. Browse public quizzes; confirm draft/private quizzes cannot be played and unlisted quizzes work by link.
11. Play quizzes with no timer, per-question timer, and whole-quiz timer. Submit, reload the saved result, and check attempt history. Inspect playable responses: no `correctOption`; submitting a client-supplied score must not alter server grading.
12. Inspect cookies: `HttpOnly`, `SameSite=Lax`, and `Secure` over production HTTPS. Confirm UI identities show QV public IDs rather than MongoDB user IDs.


## Branch 8 administration

Authenticated admins reach `/admin` through the navbar or `/dashboard`. The six admin pages cover live metrics, users, quizzes, classrooms, assignments and attempts. Existing student/teacher pages and Branch 4?7 delivery, grading, notifications and messaging remain in place.

### API and data safety

Every `/api/admin` route applies `protect` and `authorizeRoles("admin")`; mutation services also check admin access. Anonymous requests receive 401 and non-admin requests receive 403. References identify a record; they never grant access. Lists use explicit serializers, fixed projections, stable creation-date/internal-ID sorting, page/limit pagination (default 20, maximum 50, maximum page 10000) and escaped literal searches up to 100 characters. Dashboard counts use database count queries, and recent user/quiz/assignment activity is limited to five rows each. No notification body or chat content is exposed by administration.

| API | Purpose |
| --- | --- |
| GET /api/admin/dashboard | Live counts and bounded recent metadata |
| GET /api/admin/users; GET /api/admin/users/:publicId | Search by name/email/QV ID, role/status filters, safe details and counts |
| PATCH /api/admin/users/:publicId/role | student ? teacher only |
| PATCH /api/admin/users/:publicId/status | active ? suspended, non-admin only |
| GET /api/admin/quizzes; GET /api/admin/quizzes/:reference | Metadata search, status/visibility/moderation filters, relationship counts |
| PATCH /api/admin/quizzes/:reference/moderation | publish, unpublish, restrict, restore |
| GET /api/admin/groups; GET /api/admin/groups/:code | Name/code/teacher search, status filter, paginated related assignments |
| PATCH /api/admin/groups/:code/status | archived or active through shared classroom status service |
| GET /api/admin/assignments; GET /api/admin/assignments/:token | Title/classroom/token search, availability and group-code filters |
| GET /api/admin/assignments/:token/analytics | Existing frozen-roster analytics, per assignment |
| GET /api/admin/attempts; GET /api/admin/attempts/:reference | Safe summaries/submitted review; search by student name/QV ID or UUID |

Attempt filters additionally accept status, kind (standalone/assignment), studentPublicId, assignmentToken, from and to. Date bounds are inclusive on startedAt; date-only values mean UTC midnight. Assignment availability filters use server time and the existing exclusive due-time boundary. Broad relationship searches consider at most 100 matching people; the API/UI explicitly reports truncation and asks for a narrower search/QV ID.

Users retain QV IDs, classrooms retain group codes and assignments retain share tokens. Newly created quizzes and attempts get stable UUIDs. Existing records are not backfilled or modified on reads/validation: admin-only legacy quiz/attempt references use `legacy-<existing internal ID>` where no public UUID exists. That necessary fallback is the only internal-ID-derived reference in new admin responses. It is not a public share URL and provides no authorization. Existing standalone quiz/result URLs remain compatible. No custom cryptography or new packages were added. Quiz UUIDs have a sparse unique index declaration; no database index/migration command has been run by this branch implementation.

### Account and moderation rules

`User.accountStatus` is active/suspended. A missing legacy value means active. Suspended users cannot log in or use an existing cookie on protected APIs, including admin APIs. Logout stays available. Unsuspension restores access under the existing cookie expiry/password rules; there is no new session-revocation subsystem. Public registration still accepts only student/teacher and cannot set suspension status.

Normal role management cannot promote to admin, demote an admin, or mutate the acting admin. Admin accounts cannot be suspended or unsuspended here. Student ? teacher preserves memberships, attempts, results, notifications and frozen rosters without blocking ordinary student history. Current-role authorization still applies: retained student memberships do not grant a promoted teacher another teacher's management privileges or student-only attempt eligibility. Teacher ? student is blocked by active owned classrooms, draft/published assignments, or unrestricted published quizzes. Archived classrooms, closed assignments and unpublished quizzes remain historical records; nothing is transferred or deleted. Publishing a quiz or restoring a classroom requires a current teacher/admin owner.

`Quiz.moderationState` is active/restricted; absent legacy values mean active. Restrict sets the source to draft and prevents public discovery/new play/new standalone starts, teacher republishing and new assignment publication. Restore clears the restriction but leaves draft status. Publishing validates all six question types and timers. Existing frozen standalone attempts and published assignments remain gradeable and existing assignment eligibility rules still apply. Historical analytics/results are retained. Admin lists/details never return answer keys, raw frozen snapshots, passwords, auth tokens or raw answer arrays.

Classroom administration uses the existing active/archived states through one shared transaction-based status transition with membership-revision updates. Archive preserves memberships, assignments, results and chat history; existing active-classroom checks deny new sends, membership mutations and assignment attempts. Archive does not rewrite assignment statuses/rosters. Restoring may resume a still-open assignment under its original rules. No hard-delete, bulk action or destructive resource-transfer UI exists. Risky frontend actions use native accessible confirmation dialogs, but backend authorization and transitions never depend on a client confirmation boolean.

### Verification and limitations

Local tests use mocked database methods and loopback HTTP; real MongoDB integration remains opt-in and disabled. Run from the repository root:

```powershell
$env:TEST_MONGO_URI = ''
$env:RUN_ASSIGNMENT_MONGO_TESTS = ''
$env:RUN_COMMUNICATIONS_MONGO_TESTS = ''
npm test --prefix server -- '--test-name-pattern=^(?!MongoDB)'
npm run lint --prefix client
npm run build --prefix client -- --configLoader native
$adminSyntaxFiles = rg --files server/src server/test server/test-support -g '*.js'
foreach ($adminSyntaxFile in $adminSyntaxFiles) {
    node --check $adminSyntaxFile
    if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $adminSyntaxFile" }
}
git diff --check
git --no-optional-locks status --untracked-files=all
```

Counts are a refresh-time overview, not an atomic cross-collection snapshot. Suspension cannot undo a request already running. Transactions and conditional updates protect mutations, but the tests do not prove actual MongoDB locking/index behavior or simultaneous role changes versus creation of teaching resources through older flows. No normal database connection, migration, dependency install, deployment, staging, commit or push is part of implementation verification. Native-dialog behavior, responsive layouts and real database query behavior require manual smoke testing. Existing assignment analytics are reused and may load the scoped assignment's roster/results; dashboard counts never load entire collections.

### Browser smoke tests

1. Log in as an admin: `/dashboard` redirects to `/admin`; the Admin link appears on desktop/mobile. Refresh metrics and compare counts with your known local test data. Empty categories show zero, never demo records.
2. Open Users: search name, email, exact QV ID and literal punctuation; filter all roles and active/suspended status. Inspect counts. Test next/previous pages with more than 20 users; change filters while a request is pending.
3. Promote a student with classroom memberships and prior results to teacher. Verify memberships/history/frozen roster rows remain; no ownership is transferred. Return this user to student if they have no active teaching resources. Try demoting a teacher with an active classroom, assignment or published quiz: expect 409 and unchanged ownership.
4. Try admin promotion, demoting the current admin and suspending any admin through direct API calls: expect 400/403. Public registration must still reject admin and ignore submitted accountStatus. Missing legacy accountStatus must remain active.
5. With a student signed in in another browser, suspend that student as admin. Their next protected request must receive 403; login must fail; logout must work. Unsuspend and confirm normal login/access returns. Cancel a suspension dialog and confirm nothing changes.
6. Create/publish a mixed-type quiz; start a standalone attempt and publish a classroom assignment before restriction. Restrict the source quiz: new public play and new assignment publication must fail; teacher republishing must fail. Finish the already-started standalone and eligible frozen assignment: original grading must persist.
7. Restore the quiz and confirm it stays draft until explicitly published. Publish validation must reject malformed/empty content. Inspect admin list/detail/network responses: no grading keys, snapshots, passwords or auth data.
8. Open Classrooms: search by name, code, teacher name/email/QV ID; inspect member counts and related assignments. Archive a classroom: history/analytics/chat reading stays available, new sends/invitations/attempts fail. Restore it and confirm eligible activity returns. Cancel archive and restriction dialogs to confirm no changes.
9. Open Assignments: filter draft/upcoming/open/overdue/closed and search classroom/title. Compare the same quiz assigned to two classrooms: each report keeps its own frozen roster and results. Deleted source resources show historical fallbacks without crashing.
10. Open Attempts: inspect submitted standalone/assignment results and an in-progress attempt. Completed review shows only student's submitted answers and marks; in-progress has no review. Old results without review retain their summary. Test legacy admin references and new UUID records.
11. As student and teacher, visit all six `/admin` pages: route guards redirect out. Manually request every admin GET/PATCH endpoint: expect 403 even with valid resource identifiers. Anonymous requests must receive 401.
12. Test at 360px width, keyboard-only dialog confirmation/cancel/Escape, pagination, empty search, simulated API failure/retry and logout while loading. Recheck advanced quiz creation/play, assignment resume/scoring, groups/invitations/join requests, notifications, messaging and public browsing.
