---
title: "On Working with Agents"
date: "April 17, 2026"
id: 2
display: true
---

It’s hard to overstate how quickly AI coding workflows are evolving. If we want to keep pace, our processes need to evolve alongside the tools. These are notes on where software workflows were, where I am now, and where I think we should push next.

Before AI, the software engineering workflow was comparatively straightforward. Engineers owned the loop: they wrote code, reviewed changes, and pushed updates. With the advent of vibe coding, that loop has started to split into a few stages.

1. **The Supervised AI Stage:** Agents can write code and make changes, but they often introduce bugs and require close supervision, especially around design and style. Working with these agents is mostly a process of hand-holding: pointing out where they went wrong, clarifying the functionality or design we actually want, and reading their code to make sure they have not made egregious architectural decisions.
2. **The “Unsupervised” AI Stage:** As agents improve in code quality and reliability, the question shifts from how humans should supervise implementation to how humans should provide input. Small pieces of work can now be delegated almost entirely. I think the future of “software engineering” increasingly looks like project management: identifying needed changes, writing clear issues, assigning work to agents, and deciding whether the output is good enough to accept. Agents may do more of the implementation unsupervised, but humans remain the final arbiters of acceptance.

Currently, I’m still working in the supervised flow: I open a Codex or Claude Code session, tell it to get acquainted with the project, and then point out things I’ve noticed about the site, things I want to improve, and so on. But this is probably already the wrong default. Since agents can now complete small tasks almost autonomously, humans should spend less time guiding implementation and more time defining work for agents to execute.

To see why, consider the supervised-AI feedback loop:

1. The human writes a feature request and hands it to the agent.
2. The agent makes a first pass, usually relatively simple or unrefined.
3. The human discovers bugs, gaps, or design issues and replies with feedback.
4. The agent fixes the issues.
5. Steps 3 and 4 repeat a few times.
6. The feature is complete and gets merged.

In this setup, the human is blocked on checking the agent’s work and giving feedback. The human’s work is split between idea generation and digging through implementation details with the agent. Parallelization is hard because every active task requires repeated human attention.

Now suppose the amount of human input required inside implementation trends toward zero. The human’s work shifts toward idea generation, judgment, and prioritization: looking at the product, noticing what is missing, and turning those observations into concrete tasks. That work is much less coupled to implementation. There are still dependencies, since the features humans ask for depend on what has already been built, but the bottleneck moves away from implementation babysitting and toward task selection and acceptance.

What does this imply for the right system going forward? As AI implementation gets better, software engineers need to graduate from construction workers into site overseers and architects. Instead of playing code ping-pong with Claude, we should focus on the overall product: what needs to be built, what is missing, and what standard the output has to meet.

Here is a sketch of a system for working with AI more efficiently. The pieces are:

- Human product lead
- Design/feature-focused agent assistant
- Implementation agents
- Review agents

The flow is simple. The human and design agent work together to generate feature requests and provide high-level product feedback. Implementation agents take those requests and build them. Review agents check whether the resulting changes meet codebase standards, satisfy the task, and are well-written.

The important caveat is that this only works if the process is robust and well-defined. Structurally, this looks less like handcraft and more like an assembly line, so standards for code, review, and workflow need to be explicit and strictly enforced. Fortunately, AI also makes those standards easier to harden: agents can help write tests, encode review checklists, generate verification scripts, and catch drift from codebase conventions.

Agents are already powerful tools for scaling productivity. The next step is to scale the processes around them as their capabilities improve.
