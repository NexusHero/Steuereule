# Security

## Reporting a vulnerability

Please report a suspected vulnerability privately, not in a public issue: on GitHub open the **Security** tab of
this repository and choose **Report a vulnerability**. The report is visible only to the maintainers.

Include what you can of: the affected part (API, web app, MCP access, infrastructure), the steps to reproduce,
and what an attacker could reach. Please do not use real personal or tax data in a report.

We read every report and answer in the advisory thread. There is no bug bounty.

## Scope

The supported version is the current `main` branch. Findings in third-party dependencies are welcome when they
are reachable through this application.

## What is already checked

Every pull request runs secret scanning (gitleaks), static analysis (Semgrep with rules for NestJS and data
protection, SonarQube Cloud), a dependency audit, container and infrastructure scans (Trivy), and a dynamic scan
of the production containers (OWASP ZAP). `docs/ci-pipeline.html` lists the checks and what each one proves.
