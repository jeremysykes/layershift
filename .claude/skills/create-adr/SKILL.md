---
name: create-adr
description: Create a new Architecture Decision Record. Use when an architectural decision needs to be documented — new effects, changed interfaces, new dependencies, or pipeline changes.
argument-hint: "[title of the decision]"
allowed-tools: [Read, Write, Glob, Grep]
---

# Create ADR

Create a new Architecture Decision Record in `docs/adr/`.

## Steps

### 1. Determine Next Number

Check the highest existing ADR number:

```bash
ls docs/adr/
```

Increment by 1. Format: `ADR-NNN` (zero-padded to 3 digits).

### 2. Create the ADR File

Filename: `docs/adr/ADR-NNN-<kebab-case-title>.md`

Use this template:

```markdown
# ADR-NNN: $ARGUMENTS

## Status
Proposed

## Context
What problem are we solving? What constraints exist?

## Decision
What did we decide and why?

## Consequences
What are the tradeoffs? What does this enable or prevent?
```

### 3. Update Architecture.md

Add the new ADR to the documentation map in `docs/architecture.md`.

### 4. Report

State the ADR number, title, and file path.

## When to Create an ADR

- New effects
- New modules or significant refactors
- Changed interfaces or APIs
- New dependencies
- Altered rendering pipeline
- Changed build outputs
- Any deviation from documented constraints
