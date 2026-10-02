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
