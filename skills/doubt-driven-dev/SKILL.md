---
name: doubt-driven-dev
version: 1.0.0
description: |
  A working method, not an end-of-task review. Throughout development, identify
  assumptions, separate verified facts from guesses, seek evidence, and never
  build on top of an unverified belief. Use continuously, from the first line
  written to the last.
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

# Skill: Doubt-Driven Development

This skill is not a phase. It runs continuously, underneath everything, from the
first line you write to the last. The question it keeps asking is simple:

> "I think X is true, but I have not verified it. What would it take to verify X,
> and am I building on it?"

The failure this prevents is specific and common. You form a belief, the belief
turns out to be wrong, and the wrongness has already been encoded into a
structure that took effort to build. The cost is not the correction, it is the
work built on top of the error.

## The core distinction

Sort every claim into one of three categories, constantly, not once at the end:

- **Verified.** You ran it, read it, or the tool confirmed it. You can say what
  the evidence was.
- **Inferred.** Strong reasoning, no direct evidence. Plausible, not known.
- **Assumed.** You filled a gap because something was needed to continue.

Only the first category is a foundation. The second is usable when you flag it.
The third is a debt, and it accrues interest silently.

A claim like "this endpoint returns a 404 without auth" is verified only if you
made the call. Reasoning about what an API probably does does not verify it.
This distinction is the whole skill.

## The sentence to say out loud

**"I think X is true, but I have not verified it."**

Then either verify X, or state clearly that you are proceeding on an assumption
and name the risk. Both are acceptable. Quietly building as if it were verified
is not.

This sentence is the tool. Its value is not humility, it is that it forces the
next step to be evidence rather than more confident prose.

## How to work

### Before each significant step

Ask three questions:

1. What am I assuming here that I have not checked?
2. Is there a cheaper way to check it than to find out it was wrong later?
3. If this assumption is wrong, how much work gets thrown away?

The third question is the useful one. High blast radius deserves high
verification effort, not the other way around.

### Verify proportionally to consequence

Not everything deserves the same effort. A wrong import statement costs a
compile error. A wrong assumption about a data format, an API contract, or a
user's intent can cost silently, which is worse because nothing announces it.

Spend verification effort where failure is **silent**. A test that crashes tells
you it is wrong. A parser that quietly returns an empty result on malformed input
tells you nothing, and that asymmetry should drive where you look.

### Prefer the source over the summary

- An API's own response beats a description of that response.
- Reading the code beats reasoning about what the code probably does.
- Running the test beats predicting the test result.
- The documentation for the installed version beats your memory of it.

Your training data contains plausible statements about code that is now
different, and about APIs that have since changed. Reasoning from memory is
sometimes fine, and you should notice when you are doing it.

### Keep a running list

Maintain a short, live list of what you believe and how confident you are. It
does not need to be a document. Three lines in your head, or in a scratch note,
is enough to stop a belief from quietly hardening into a decision.

Revisit it when the direction changes. Some belief you have held quietly for an
hour is probably still unverified, and it is probably load-bearing.

### Say when you are guessing

When you proceed on an assumption, make it visible: in the code as a comment, in
the message to the user, or both. An unstated assumption found later reads as a
hidden bug. A stated one reads as a known risk, which is a completely different
thing to hand over.

## When you detect uncertainty

Do not resolve it by picking the more likely answer and moving on. That is the
default failure. Instead:

1. **Can you verify it yourself?** Do that. Read the file, run the command, call
   the API, grep for the usage.
2. **Is verification expensive relative to the risk?** If not, verify anyway.
3. **Is it genuinely unknowable from here?** Then say so, state the assumption,
   name the consequence if you are wrong, and ask.
4. **Delegate if it is separable.** A sub-agent can verify a bounded question
   in parallel. Give it a precise question, not a vague one.

The discipline is in the second and third cases. Both feel like slow progress.
They are the difference between a working system and a plausible one.

## Continuous self-criticism

Not at the end, throughout. When you are mid-task, periodically ask:

- Am I solving the problem I was asked, or the one I found interesting?
- Have I changed a design decision without noticing I was relying on it?
- Did I just treat a successful command as proof the feature works?
- Is there a piece of this I have been avoiding because it might be inconvenient?

The last one matters. Tasks that are hard to verify are exactly the ones where
confidence is most likely to be misplaced.

## Errors to avoid

- **Fluency mistaken for accuracy.** A confident, well-formed explanation of
  something wrong is still wrong, and it is more dangerous than an obviously
  broken one.
- **Accepting your own earlier conclusion.** Your prior reasoning is not
  evidence, no matter how sound it seemed.
- **Verifying only what you built.** The parts you did not touch are where
  regressions live.
- **Testing one case and generalising.** A single green path says nothing about
  the case you did not try.
- **Citing a source without reading it.** If you did not read it, you do not know
  what it says, and neither does the user.
- **Mistaking absence of error for absence of problem.**
- **Letting the code define the requirements.** If the code does something
  surprising, the interesting question is why, not whether the new code matches
  it.

## Relationship to the other skills

**Interview** happens first, to establish the goal and surface the unknowns.
**This skill** then governs every step of the build, checking assumptions as you
go. **Hostile-review** takes a finished first solution and tries to break it.

The cycle is: interview, then doubt-driven-dev, then hostile-review, then back
to doubt-driven-dev to fix whatever the review found and to re-check whatever
the fix assumed.
