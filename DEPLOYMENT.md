# BSMS Web — Deployment Guide

This document explains the deployment architecture, branch naming conventions, contribution workflow, and release process for BSMS Web.

## Deployment Architecture

BSMS Web uses GitHub for source control and Vercel for hosting and deployments.

### Production

| Setting | Value                                                      |
| ------- | ---------------------------------------------------------- |
| Branch  | `main`                                                     |
| URL     | [https://bsms-web.vercel.app](https://bsms-web.vercel.app) |
| Purpose | Public production website                                  |

The `main` branch contains the production version of BSMS Web. Changes must follow the repository's pull request, review, and branch protection requirements before being merged into production.

### Contributor Development Environments

Each contributor is assigned their own development branch and corresponding Vercel deployment.

The branch and deployment naming conventions are:

| Component         | Naming convention                 | Example                    |
| ----------------- | --------------------------------- | -------------------------- |
| GitHub branch     | `dev[number]`                     | `dev1`                     |
| Vercel deployment | `bsms-web-dev[number].vercel.app` | `bsms-web-dev1.vercel.app` |

For example, the `dev3` branch corresponds to:

[https://bsms-web-dev3.vercel.app](https://bsms-web-dev3.vercel.app)

Each contributor works on their assigned development branch. This provides an isolated place to implement and test changes without directly modifying the production branch.

Contributors must use their assigned branches and must not assume they have permission to modify another contributor's branch.

A development deployment is intended for testing and review. It must not be treated as the production website.

## Branching Policy

### Production Branch: `main`

The `main` branch is reserved for production-ready changes.

- Only authorized maintainers may merge pull requests into `main`.
- Contributors must not bypass branch protection or required status checks.
- Changes should be reviewed and tested before merging.
- Production changes must be submitted through the repository's established pull request workflow.

### Contributor Branches: `dev[number]`

Each contributor receives an assigned development branch using the `dev[number]` naming convention.

Examples include `dev1`, `dev2`, and `dev3`.

Contributors are expected to:

- Make changes on their assigned branch.
- Keep changes relevant to the task or pull request.
- Test their work in their development environment.
- Push commits to their assigned branch.
- Submit pull requests for review when their changes are ready.
- Address review feedback before requesting approval to merge.

Contributors must not assume that creating a branch automatically configures its Vercel deployment. Branch-to-project mappings and deployment settings must be configured appropriately.

## Pull Request Workflow

The standard contribution and release workflow is:

1. Obtain an assigned development branch.
2. Make changes on that branch.
3. Push the changes to GitHub.
4. Verify that the corresponding Vercel development deployment works.
5. Review automated validation results and fix any failures.
6. Create a pull request targeting the appropriate branch.
7. Explain the changes, testing performed, and any known risks.
8. Wait for an authorized maintainer to review the pull request.
9. Address requested changes and wait for approval.
10. Merge only when all required checks and repository rules are satisfied.

Pull requests targeting `main` must meet the production branch's review and protection requirements.

A successful development deployment does not automatically authorize a production release.

## Vercel Configuration

Vercel must be configured to deploy the appropriate GitHub branch to the intended project or deployment domain.

For production:

- The production deployment must use `main`.
- The production domain must point to the intended production project.
- Required environment variables must be configured for the production environment.

For contributor development environments:

- Each assigned `dev[number]` branch must be associated with its intended deployment.
- Each deployment must use the correct project configuration and environment variables.
- Contributors must verify their deployment before submitting changes for review.

When creating a new contributor environment, verify the GitHub branch, Vercel project configuration, domain assignment, and deployment status.

## Environment Variables and Secrets

Required environment variables must be configured in the appropriate Vercel project and environment.

See [`.env.example`](.env.example) for documented variable names.

Security requirements:

- Never commit real credentials or private keys.
- Never share production secrets with unauthorized contributors.
- Configure environment variables only for the environments that require them.
- Keep development and production configuration appropriately separated.
- Rotate exposed credentials immediately when necessary.
- Do not assume that removing a secret from a commit makes it safe again.

Development deployments must not be given unnecessary access to production credentials or sensitive user data.

## Dependencies and Build Configuration

Vercel deployments depend on the repository's application code, dependency declarations, and project configuration.

Before deploying changes that affect the server or build process:

- Verify that required packages are declared in `package.json`.
- Keep `package-lock.json` synchronized if npm is used to manage dependencies.
- Check Vercel's install and build settings.
- Verify that required environment variables are present.
- Confirm that routing and output settings match the application's architecture.

A missing server dependency or incorrect deployment configuration can cause runtime failures even when the source code is present in GitHub.

## Deployment Verification

After pushing changes, verify the relevant development deployment. After a production release, verify the production deployment as well.

Depending on the changes, checks should include:

- The deployment completes successfully.
- The intended URL serves the expected version.
- Affected pages load correctly.
- Authentication and account operations work.
- Chat and conversation functionality work.
- API routes return expected responses.
- Database operations behave correctly.
- Browser console and server logs do not show unexpected errors.
- Existing functionality remains operational.

Testing requirements should be appropriate to the scope and risk of the changes.

## Troubleshooting

### Development Deployment Is Missing or Incorrect

1. Confirm the branch follows the `dev[number]` naming convention.
2. Verify that the branch exists in GitHub.
3. Check that the correct branch is associated with the intended Vercel project.
4. Review the deployment status and build logs.
5. Verify the domain configuration.
6. Confirm that the latest commit is included in the deployment.

### Production Deployment Fails

1. Open the failed deployment in Vercel.
2. Inspect the build and runtime logs.
3. Identify the first relevant error.
4. Verify dependency declarations and lockfile consistency.
5. Check environment variables and project configuration.
6. Fix the underlying issue and redeploy through the established workflow.

### Server or API Errors

- Inspect Vercel runtime logs.
- Verify required dependencies and environment variables.
- Check route and handler configuration.
- Review authentication, authorization, and request validation.
- Avoid exposing secrets or private user information in error messages.

### Database Errors

- Verify database configuration and service credentials.
- Check database permissions and access rules.
- Inspect relevant server errors.
- Investigate excessive reads, data transfers, and permission failures.
- Avoid destructive operations without an approved recovery plan and a verified backup.

## Rollbacks and Recovery

If a production deployment causes a serious regression:

1. Assess the impact and notify an authorized maintainer.
2. Identify the last known good production deployment.
3. Use Vercel's supported rollback or redeployment process when appropriate.
4. Verify that production functionality has been restored.
5. Investigate and correct the underlying problem.
6. Submit the correction through the normal review process.

Rolling back application code does not automatically reverse database changes. Database recovery must be evaluated separately.

## Security Incidents

Report security vulnerabilities privately according to [`SECURITY.md`](SECURITY.md).

If a deployment exposes credentials or sensitive user information, notify an authorized maintainer promptly. Revoke or rotate affected credentials as necessary and investigate the scope of the exposure.

Do not publish vulnerability details or sensitive logs in public issues or pull requests.

## Policy Maintenance

This document should be updated whenever the deployment architecture, branch naming conventions, Vercel configuration, or release process changes.

Deployment behavior must be verified against the actual repository and Vercel configuration rather than assumed from naming conventions alone.
