---
name: hostile-review
version: 1.0.0
description: |
  Adversarially review your own completed work before handing it over. Assume the
  solution is wrong until proven otherwise, actively hunt for bugs, edge cases,
  and missed requirements, verify claims by running things, then fix what you
  find. Use after a first solution exists.
license: ISC
compatibility: claude-code opencode
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Edit
  - Bash
  - WebSearch
  - WebFetch
  - AskUserQuestion
---

# Skill: Hostile Review

This skill runs **after** a solution has been produced. Your job now is to treat
your own work as suspect.

The default state after building something is a sense of completion. That feeling
is evidence of nothing. It is what you feel after writing code that compiles,
not after writing code that is correct. This skill exists to replace that feeling
with actual evidence.

## The stance

One question drives the whole review:

> **"What could be wrong in what I just did?"**

Not "is this good" and not "is this complete enough for the request". Those invite
you to grade your work. This question assumes there is a defect and asks you to
find it. Most of the time there is one. Sometimes the one you find is a real
problem you would have shipped.

A useful reframe: if a stranger submitted this solution and you were reviewing
it before deploying, what would you check? Do that.

## What to attack, in order of yield

### 1. Requirements, not code

Re-read the original request, word for word, then your work, and check it against
them point by point.

The most common real defect in a first solution is not a bug. It is a **silent
mismatch with the request**, where you built something adjacent to what was asked
and never noticed. Build the checklist from their words, not from your intent,
because your intent is what you are trying to confirm.

Look especially for:

- a requirement you satisfied in letter but not in substance;
- a constraint you silently dropped as inconvenient;
- scope you expanded, or narrowed, without saying so;
- an assumption you made that they never agreed to.

### 2. Claims you made but did not verify

Go back through everything you asserted and check which ones you actually
tested. The dangerous sentences are the confident ones: "this works", "this
handles the empty case", "this is backwards compatible".

For each, either verify it now, or downgrade it to what you actually know. A
review that leaves an unverified claim stated as fact has made the situation
worse, not better.

### 3. Edge cases and boundaries

For each input, each branch, each external call:

- What happens on empty, null, undefined, zero, negative?
- What if the list is one element, or enormous?
- What if the external call is slow, times out, returns malformed data, or
  returns 200 with an error body?
- What if two things run concurrently and touch the same state?
- What if this runs twice? Is it idempotent?
- First element, last element, boundary values, the value just past a threshold.
- Unicode, accents, very long strings, special characters.
- What if the user closes the tab, or the process dies halfway?

Write a list of these and actually test them. A test that throws is a bug that
found itself.

### 4. Logic and reasoning

Re-derive the important logic by hand, independently of how you wrote it. If you
read your own code and nod along, you inherit its mistake, because you wrote it
for the same reason you believe it.

Check specifically:

- Off-by-one at every boundary.
- Inverted conditions. A branch that never executes usually means a logic error.
- Conditions that can never be true, or always true. Search for these directly.
- Arithmetic and unit conversions, and rounding at each step.
- Ordering dependencies that are not enforced.
- Error paths. Does the failure case actually do the right thing, or merely
  avoid crashing?

### 5. Effects and regressions

- What else uses what you changed? Search for callers before you change a
  signature or a return type.
- What did you change that nothing tests?
- Did you modify a shared file whose other users you did not check?
- What config, cache, or generated file is now stale?
- What still depends on the old behaviour?

### 6. Your technical choices

Justify the decisions again, now that you have the implementation. Alternatives
worth revisiting: does the codebase already have a utility for this? Is there a
standard library call you hand-rolled? Is the abstraction earning its
complexity? Is there a simpler version that meets the actual need?

## How to test

Running things beats reasoning about things.

- Run the tests, and read the failures you were expecting to ignore.
- Write a test for the case you were unsure about. The fact that you were unsure
  is the reason to write it.
- Try to construct an input that produces a wrong answer. If you cannot think of
  one, you are not trying hard enough, not that the code is safe.
- Check the boundaries of every range you wrote.
- Actually run the thing where that is possible. A command you did not execute is
  a hypothesis.

## When you find problems

Fix them. Then re-examine the fix, because fixes introduce new code and new
assumptions. A patch that silently widens scope is a second defect.

Say plainly what you found and what you changed. Do not quietly patch and present
the result as though it were right the first time. The user needs to know which
parts are solid and which were wrong, because that is what determines how much
the result should be trusted.

If you find a problem you cannot fix, say so. An unfixable issue the user knows
about is far better than a clean-looking delivery that hides one.

## Errors to avoid

- **Reviewing to confirm rather than to find.** Reading your own work looking
  for permission is the most common way this skill turns into theatre.
- **Stopping at the first pass.** The second pass finds things the first one did
  not, because the first pass is still confirming.
- **Only testing the happy path.** It is the path you already believe works.
- **Treating a passing test as proof.** A test proves one case, and usually the
  one you thought of when writing it.
- **Rewriting instead of checking.** Wholesale rewrite in response to a review is
  its own kind of error.
- **Declaring victory because it was a long effort.** Effort spent is not
  quality achieved.
- **Skipping the review because the change was small.** Small changes break
  large things, and the review is cheapest when the diff is small.

## Relationship to the other skills

**Interview** established the goal. **Doubt-driven-dev** governed the build. This
skill attacks the result, which is a different posture and produces different
findings: doubt-driven-dev catches wrong beliefs while they are still cheap,
hostile-review catches the consequences of the beliefs that survived.

Then return to **doubt-driven-dev** to verify each fix, because a fix is new code
carrying new assumptions, and those need checking too.
