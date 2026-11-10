# Security

## Reporting a problem

Please report security problems privately through
[GitHub's private vulnerability reporting](https://github.com/praisezu/Vanta/security/advisories/new),
not in a public issue. Fixes ship as normal Vanta updates, which installs get automatically.

## What Vanta does and doesn't do

- No analytics, telemetry or Vanta servers. Nothing about you is collected.
- Vanta never reads your Discord login token for itself. The always-on token guard stops installed plugins from
  reading it, and blocks any request to a non-Discord website that carries it.
- Store plugins are reviewed and pinned to the exact reviewed file (SHA-256); a changed file won't install.
- Links to known scam sites (the public Discord-AntiScam list, checked locally) get a warning before opening.
- Everything Vanta stores stays in its folder on your PC (`%APPDATA%\Vanta`). API keys you give Capri are encrypted
  with your system's protection (DPAPI on Windows) and only sent to the company they belong to.

The full list of websites Vanta contacts, and when, is on <https://tryvanta.dev/security/>.
