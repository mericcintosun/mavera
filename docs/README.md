# Mavera documentation

Read in order. Every document opens with a one-paragraph summary and closes with "Open questions".
Diagrams are Mermaid (rendered natively by GitHub); SVG exports live in [`img/`](img/).

| # | Document | What it answers |
| --- | --- | --- |
| 00 | [Overview](00-OVERVIEW.md) | Problem, one sentence, users, why a chain, why Monad, scope in/out |
| 01 | [Architecture](01-ARCHITECTURE.md) | Components, data flow, trust boundaries, deployment |
| 02 | [Contract spec](02-CONTRACT-SPEC.md) | Storage, functions, events, accounting math, invariants, gas notes |
| 03 | [x402 flow](03-X402-FLOW.md) | Paid-call sequence, failure and fallback paths, facilitator facts |
| 04 | [Frontend](04-FRONTEND.md) | Page spec, polling, wallet flows, UI principles, copy |
| 05 | [Test plan](05-TEST-PLAN.md) | Unit, fuzz and invariant tests, handler design, Slither, verification |
| 06 | [Threat model](06-THREAT-MODEL.md) | Assets, actors, attacks, mitigations |
| 07 | [Runbook](07-RUNBOOK.md) | Event-day timeline and copy-paste commands |
| 08 | [Demo and pitch](08-DEMO-AND-PITCH.md) | 90-second demo, 2-minute pitch, Q&A |
| 09 | [Competitive landscape](09-COMPETITIVE-LANDSCAPE.md) | Prior art and how Mavera differs |
| 10 | [Monad notes](10-MONAD-NOTES.md) | Chain facts that shaped the design, with sources |
| 11 | [Toolchain](11-TOOLCHAIN.md) | Verified versions, commands, dates, decisions |
| 12 | [Submission checklist](12-SUBMISSION-CHECKLIST.md) | What the Blitz platform needs by 16:30 |
| ADR | [adr/](adr/) | Architecture decision records 0001–0005 |
| — | [Slither report](slither.md) | Static-analysis checklist (Slither 0.11.6) with the per-finding triage |
