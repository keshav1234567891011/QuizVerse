# QuizVerse

## Project

- React/Vite frontend
- Express/Mongoose backend
- MongoDB Atlas
- JWT authentication with httpOnly cookies

## Git workflow

- You MAY create feature branches.
- You MAY run `git add`, `git commit`, and `git push`.
- You MAY push branches to `origin`.
- You MAY merge a feature branch into `main` only after its implementation passes builds/tests and the working tree is clean.
- Never force push.
- Never rewrite published history.
- Never delete remote branches unless the user explicitly asks.
- Never use `git reset --hard` or `git clean -fd` unless the user explicitly approves.
- Never commit `.env` files, secrets, credentials, `node_modules`, build output, or local configuration containing secrets.
- Use clear conventional commit messages.
- Push each completed feature branch to `origin` before merging it.
- Keep `main` deployable.
- Before every commit, run appropriate checks and `git diff --check`.
- Before every merge, make sure the relevant builds/tests pass.
- At the end, push all legitimate project branches and tags to `origin`.

## Preserve existing security

- Public registration may only create student or teacher accounts.
- Admin cannot be selected publicly.
- Backend authorization is authoritative.
- Correct quiz answers must not be exposed by playable APIs.
- Scoring remains server-side.
- Public QuizVerse IDs are used for user-facing identity.
