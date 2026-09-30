---
name: interview
version: 1.0.0
description: |
  Conduct a thorough interview before writing any code. Understand the problem,
  challenge the requester's assumptions, explore what already exists, and refuse
  to start until the important unknowns are resolved.
license: ISC
compatibility: claude-code opencode
allowed-tools:
  - Read
  - Grep
  - Glob
  - AskUserQuestion
  - WebSearch
  - WebFetch
---

# Skill: Interview Before Building

This skill runs **before** any implementation. Its purpose is to make sure you
understand the problem well enough that building the wrong thing is no longer a
possible outcome.

A tempting failure mode is to read a request, form an immediate plan, and start
editing. That is fast, it feels productive, and it is how you end up three steps
later having solved a problem nobody had.

## When to use this skill

Use it whenever a request involves any of the following:

- a change to existing behaviour rather than something wholly new;
- more than one plausible reading of what was asked;
- anything touching data that matters, money, credentials, or user-visible output;
- any request where you notice yourself thinking "obviously" or "just";
- a bug report, because the description is a hypothesis, not a diagnosis;
- a request whose vocabulary you do not recognise.

Skip it only for genuinely mechanical work, such as renaming a variable you just
introduced or running a command whose output you can simply read. If you are
unsure whether a task is mechanical, it is not.

## What to do

### 1. Restate the request in your own words

Write, briefly, what you believe is being asked. Not a paraphrase of the user's
wording, a statement of the goal in your own terms. Include what success looks
like and what is explicitly out of scope.

This step catches the most common failure: a request that reads one way and means
another. If your restatement surprises you, that is a signal to ask.

### 2. Explore before you ask

Do not open with questions. Explore first, because you may already have the
answer, and questions you could have answered yourself are noise.

- Read the files the change would touch.
- Search for the same functionality elsewhere. It is often already implemented.
- Read the configuration, the tests, the documentation.
- Check git history for prior attempts at the same thing.
- Check the dependency list before assuming a new package is needed.

If the request sounds familiar, that is not proof. The failure is not building
something that exists, it is building a second incompatible copy of it.

You can delegate this to a sub-agent when the search space is large and the
relevant area is separable from the rest of the problem. A sub-agent is useful
for breadth, not for deciding what matters.

### 3. Separate what you know from what you are guessing

Write down the actual assumptions your plan depends on. An assumption is any
statement you have not verified but are treating as true. "The user probably
wants X" is an assumption. "The function signature is Y" is an assumption until
you read it.

Mark each one as verified or unverified. Most plans collapse if two or three of
them are wrong, so this is where to spend your attention.

### 4. Ask about the material unknowns

Ask only about things that would change what you build. A good question is one
where both possible answers lead to different code.

Ask about:

- the goal behind the request, when the request is a proposed solution;
- scope boundaries, what is explicitly not wanted;
- information you could not obtain yourself;
- decisions with a trade-off the user should make;
- anything where you noticed a wrong premise.

Batch your questions. Three questions in one message beat three rounds of one.

Do not ask about things the user has no way of knowing better than you, such as
what their own codebase contains. Investigate those.

### 5. Challenge the request

This is the part most often skipped, and the part that saves the most time.

When a stated goal looks wrong, incomplete, or built on an untested assumption,
say so directly. Specifically:

- If a requested fix would treat a symptom, point at the cause.
- If a requested approach is known to fail in the conditions present, say it.
- If a request contradicts something you observed, state the observation.
- If the goal would be better served by something simpler, propose it.

The challenge must be about the work, not the person. "That will fail because the
connection is closed before the write completes" is useful. "You should know that
this API does not work like that" is not.

The interface message of this skill is a question you must not answer yourself:
"how would you do that?". The user's answer is about a part of the request you
had not understood. Almost every ambiguity in a task shows up here.

Do not be agreeable for the sake of it. Agreement is not collaboration. If a
request cannot be done, or would be a bad idea, the useful response is to say so
before writing anything.

## When you are done

You have enough to start when:

- you can state the goal, and the success criterion, in one sentence each;
- the material unknowns are answered or explicitly deferred by the user;
- the assumptions your plan rests on are written down and marked;
- you have looked for existing implementations and did not find a better one;
- you have raised any concern about the direction, and the user has heard it.

If you are still uneasy, ask one more question. Interrupting to ask is cheaper
than building the wrong thing.

## Errors to avoid

- **Starting to code while uneasy.** The urge to produce something is not
  evidence that you should. It is a bias toward visible progress.
- **Asking what you could look up.** This shifts work onto the user for no
  reason.
- **Accepting the first framing.** Requests are often proposed solutions to
  problems the requester has not fully articulated. The proposal is data, not
  the requirement.
- **Exploring so long that nothing ships.** Exploration has a budget. When you
  have the goal, the constraints, and the non-goals, stop and build.
- **Agreeing to a bad plan because it was requested.** Politeness here is a
  technical debt instrument.
- **Inferring intent from one sentence and building a whole system on it.**

## Relationship to the other skills

This skill is a phase. Once you understand the problem, move to
**doubt-driven-dev**, which governs how you work while building. After a first
solution exists, **hostile-review** takes over to try to break it.

The three form a cycle: interview, doubt-driven-dev, hostile-review, and back to
doubt-driven-dev for whatever the review surfaced.
