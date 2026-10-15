# Security

Beacyn Chess is a static website: there is no server, no account and no
database outside your own browser. Even so, problems can exist — for example
in how imported PGN or backup files are handled, or in the optional AI
settings (a stored API key, or a configurable Ollama address).

## Reporting a problem

Please **don't open a public issue** for a security problem. Instead, use
GitHub's private reporting: go to the repository's **Security** tab →
**Report a vulnerability**.

Include what you found, how to reproduce it (a sample file or steps), and
what an attacker could do with it. You'll get a reply within a week. Once it
is fixed, you're welcome to be credited in the release notes.

## Supported versions

Only the live site (the latest commit on `main`) is supported.
