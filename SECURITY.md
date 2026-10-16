# Security Policy

## BSMS Web

The security of BSMS Web and the privacy of its users are important. We appreciate responsible security research and encourage anyone who discovers a potential vulnerability to report it privately.

## Supported Versions

Security fixes are prioritized for the latest version of BSMS Web deployed to the production environment.

| Version | Supported |
|---|---|
| Latest production version | Yes |
| Older versions | Not guaranteed |

Development and preview deployments may contain unfinished features, experimental changes, or known issues. They should not be assumed to provide the same stability or security as production.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues, pull requests, or public discussions.**

Public disclosure before a vulnerability has been investigated and addressed could put BSMS Web and its users at risk.

### Preferred Reporting Method

Submit a private vulnerability report through GitHub:

[**Report a vulnerability privately**](https://github.com/JellyfishJelly13/BSMS-Web/security/advisories/new)

If private vulnerability reporting is unavailable, contact a repository maintainer privately through an appropriate communication channel. Do not post sensitive details publicly while arranging contact.

### What to Include

When reporting a potential vulnerability, please provide as much of the following information as you safely can:

- **Description:** A clear explanation of the suspected vulnerability.
- **Affected component:** The relevant page, feature, API, or system.
- **Impact:** What an attacker might be able to do and how users could be affected.
- **Reproduction steps:** A minimal, safe demonstration that helps the maintainer understand the issue.
- **Evidence:** Relevant error messages, logs, screenshots, or a proof of concept, with sensitive information removed.
- **Suggested mitigation:** Any proposed fix or workaround, if known.

Reports do not need to contain every item above to be considered.

## Responsible Disclosure Guidelines

When investigating or reporting a potential vulnerability, please:

- Test only systems and accounts you are authorized to access.
- Use your own accounts and test data wherever possible.
- Avoid accessing, modifying, deleting, or disclosing other users' data.
- Do not disrupt services, degrade availability, or interfere with other users.
- Do not conduct denial-of-service attacks, phishing, social engineering, or destructive testing.
- Do not attempt to obtain, expose, or misuse passwords, session tokens, API keys, or other secrets.
- Stop testing and report the issue if further investigation could expose private information or cause harm.
- Allow the maintainers a reasonable opportunity to investigate and address the issue before publicly disclosing the vulnerability.

Please do not upload real user data, credentials, private messages, or other sensitive information in a report.

## Scope

Potentially relevant security issues include, but are not limited to:

- Authentication, account access, and authorization weaknesses.
- Unauthorized access to accounts, conversations, or user information.
- Database access-control rules or unintended data exposure.
- Server-side API vulnerabilities and improperly validated requests.
- Exposure of passwords, API keys, private keys, tokens, or other secrets.
- Cross-site scripting (XSS), injection vulnerabilities, and other exploitable input-handling issues.
- Security weaknesses in session management or account recovery.
- Security misconfigurations affecting production deployments.
- Vulnerabilities in dependencies used by BSMS Web.

Reports about ordinary bugs, feature requests, visual issues, or general performance problems should be submitted through the repository's normal issue-reporting process instead.

## Response and Remediation

After receiving a report, maintainers will make reasonable efforts to:

1. Review the report and determine whether it describes a potential security vulnerability.
2. Request additional information when necessary.
3. Assess the severity, scope, and potential impact.
4. Develop and test an appropriate fix or mitigation.
5. Deploy or release a fix when appropriate.
6. Coordinate any public disclosure when it is safe to do so.

Response times and remediation timelines may vary depending on the severity, complexity, and available resources. A report does not guarantee that a vulnerability will be confirmed or that a fix can be released by a specific date.

Please avoid sending repeated reports about the same issue unless you have significant new information.

## Security of Contributions

All contributors must take reasonable steps to avoid introducing security vulnerabilities.

Pull requests should not include:

- Passwords, API keys, private keys, access tokens, or other credentials.
- Unnecessary personal information or private user data.
- Changes that weaken authentication, authorization, or database access controls without an approved security justification.
- Unreviewed security-sensitive changes that bypass established repository protections.

Security-sensitive changes may require additional review before they can be merged into the production branch.

## Secrets and Credential Exposure

If a credential or secret is accidentally committed to the repository, report the exposure privately and notify a maintainer promptly.

**Removing a secret from a file or commit does not necessarily make it safe again.** Exposed credentials may need to be revoked or rotated, and the affected systems may need to be reviewed.

Never include active credentials in a vulnerability report.

## Recognition

We appreciate responsible security researchers who help protect BSMS Web and its users.

Any public acknowledgment of a reporter is subject to maintainer discretion and should respect the reporter's privacy and disclosure preferences.

## Policy Changes

This policy may be updated as BSMS Web evolves. The version published in the repository is the current reference for security reporting and handling.
