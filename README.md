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

Teacher classroom progress reports and classroom quiz assignments are not part of Branch 4. The interface identifies progress reports as coming later. Existing quiz scoring/timer integrity issues from the audit remain separate follow-up work.

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
