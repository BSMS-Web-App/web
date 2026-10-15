# Contributing to BSMS Web

Thank you for contributing to **BSMS Web**! We appreciate your help improving the website, fixing bugs, and building new features.

This guide explains how to work on the codebase, use development branches, and submit changes for review.

## Table of Contents

- [Getting Started](#getting-started)
- [Where to Make Changes](#where-to-make-changes)
- [Branching Rules](#branching-rules)
- [Making Changes](#making-changes)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Review Process](#review-process)
- [Important Rules](#important-rules)
- [Need Help?](#need-help)

## Getting Started

Before contributing:

1. Make sure you have access to the BSMS Web repository.
2. Identify your assigned development branch.
3. Read these guidelines before editing files.
4. Make sure you understand what your changes are intended to accomplish.

If you are unsure where to start, ask before making major changes.

## Where to Make Changes

BSMS Web contains multiple pages and features. Before editing anything, locate the files responsible for the feature you want to change.

- **HTML files:** Page structure and content.
- **CSS files:** Styling, layout, colors, and responsive design.
- **JavaScript files:** Interactive features and client-side behavior.
- **API and server-side files:** Backend logic and server functionality.
- **Configuration files:** Project settings, routing, and deployment behavior.
- **Assets:** Images, icons, and other visual resources.

These are general guidelines. Actual file locations may vary throughout the repository.

### Before editing

- Search the repository for the relevant page or feature.
- Inspect existing code before introducing changes.
- Follow the existing design system and coding conventions.
- Keep changes focused on the task you are working on.
- Ask for clarification if you cannot identify the correct files.

Avoid rewriting entire files when a smaller, targeted change is sufficient.

## Branching Rules

BSMS Web uses development branches to keep experimental changes separate from production.

### `main`

The production branch.

- Contains the production version of BSMS Web.
- Must remain protected.
- Do not push changes directly to `main`.
- Submit a pull request when your changes are ready for review.
- Only authorized users may merge changes into protected branches.

### Assigned development branches

Each collaborator should work on their assigned development branch.

Examples include:

- `dev1`
- `dev2`
- `dev3`

Your assigned branch is your workspace for development and testing.

- Commit and push your changes to your assigned branch.
- Do not work directly on another collaborator's branch unless authorized.
- Do not merge changes into `main` yourself unless you have explicit permission.
- Do not force-push or delete branches unless authorized.

**Important:** Branch permissions are enforced by GitHub settings and rulesets, not by this document alone.

## Making Changes

When working on BSMS Web:

1. Review the existing implementation before editing.
2. Make only the changes needed for your task.
3. Preserve existing functionality unless changing it is part of the task.
4. Test the affected pages and features.
5. Check for browser console errors where applicable.
6. Review your own changes before committing.
7. Commit and push your work to your assigned development branch.

### Keep your changes focused

Avoid including unrelated modifications in the same pull request.

For example, if you are fixing the countdown page, do not also redesign the accounts page unless that work has been requested or approved.

### Protect sensitive information

Never commit:

- API keys or private credentials.
- Passwords, access tokens, or session secrets.
- Private user information.
- Environment files containing secrets.
- Other confidential configuration data.

If you accidentally expose a secret, notify the repository owner immediately. Removing it from the latest commit alone may not remove it from Git history.

## Submitting a Pull Request

When your changes are ready, submit a pull request.

### Step 1: Push your changes

Push your commits to your assigned development branch.

### Step 2: Open a pull request

On GitHub, open the repository and create a new pull request.

Select the appropriate branches:

- **Base branch:** `main`
- **Compare branch:** Your assigned development branch

Check these selections carefully before submitting.

### Step 3: Complete the pull request template

Fill out the pull request description.

Include:

- A clear summary of the changes.
- The reason for the changes.
- The files or features affected.
- Testing performed and its results.
- Screenshots when they help explain visual changes.
- Known issues or potential risks.

Do not leave important sections incomplete.

### Step 4: Submit for review

Create the pull request and wait for review.

Do not assume that opening a pull request means your changes have been approved.

## Review Process

The repository owner reviews proposed changes before they are merged into production.

During review, the owner may:

- Approve the pull request.
- Leave comments or questions.
- Request changes.
- Ask for additional testing.
- Decline the proposed changes.

If changes are requested:

1. Read the review comments carefully.
2. Make the requested corrections on your development branch.
3. Commit and push the updates.
4. Reply to the review comments when appropriate.
5. Wait for the updated changes to be reviewed.

Do not merge your own pull request into `main` unless you have explicit authorization.

Approval is not a guarantee of merging. Changes must also satisfy the repository's configured branch rules and required checks.

## Important Rules

All contributors are expected to:

- Follow these contribution guidelines.
- Work on their assigned development branches.
- Keep pull requests focused and clearly documented.
- Test changes before submitting them.
- Respect other contributors and their work.
- Avoid unauthorized changes to production or repository settings.
- Never intentionally introduce malicious code, security vulnerabilities, or destructive changes.
- Ask questions whenever instructions are unclear.

Violations of these rules may result in changes being rejected or repository access being removed.

## Need Help?

Have a question, need help locating a file, or unsure how to implement something?

**DM me on Discord: `@jellyfishjelly13`**

Feel free to reach out if you need clarification about:

- Where a feature is implemented.
- Which files you should edit.
- How development branches work.
- How to create or update a pull request.
- Bugs, implementation questions, or proposed features.

When asking for help, explain what you are trying to accomplish and include relevant error messages or screenshots when possible.

Please do not send passwords, API keys, or other sensitive credentials in Discord messages.

---

Thank you for helping make **BSMS Web** better! Your contributions are appreciated.
