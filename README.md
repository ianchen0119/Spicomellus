<!--
SPDX-FileCopyrightText: 2021 The HedgeDoc developers (see AUTHORS file)

SPDX-License-Identifier: CC-BY-SA-4.0
-->

![](./banner.png)

Spicomellus is a folk of HedgeDoc, built for an AI-native knowledge workflow.

## Why Spicomellus

Recent AI research workflows increasingly treat Markdown as an intermediate format for machine reasoning, not just human writing.

As described by Andrej Karpathy, a practical loop is emerging:

1. Collect raw sources (papers, repos, articles, datasets, images).
2. Let an LLM continuously compile them into a Markdown wiki.
3. Use the same LLM to query, refine, lint, and expand that wiki.
4. Feed outputs back into the knowledge base so exploration compounds over time.

In this loop, AI-generated Markdown can be imported into a knowledge base and rendered into HTML for model-side consumption. As Anthropic's Thariq noted, this HTML layer is useful as machine-readable context for AI systems.

But for humans, plain Markdown-to-HTML is often not the best interface for understanding reasoning structure. Spicomellus focuses on **graph cards** as a first-class view: relationships between concepts, notes, and AI input/output become visually traceable like a mind map.

This gives teams and learners a faster way to:

- understand how an AI answer is grounded,
- inspect input/output chains and dependencies,
- spot gaps or contradictions,
- and make better decisions with less cognitive overhead.

Spicomellus exists to bridge both worlds at once:

- **AI-readable structure** (Markdown/HTML knowledge pipelines), and
- **human-readable structure** (graph-card cognition).

- ℹ️ Read all about HedgeDoc and the history of the project on [our website](https://hedgedoc.org)

# License

Licensed under AGPLv3. For our list of contributors, see [AUTHORS](AUTHORS).

The license does not include the HedgeDoc logo, whose terms of usage can be found in
the [github repository](https://github.com/hedgedoc/hedgedoc-logo).

[matrix.org-image]: https://img.shields.io/matrix/hedgedoc:matrix.org?logo=matrix&server_fqdn=matrix.org

[matrix.org-url]: https://chat.hedgedoc.org

[matrix.org-dev-url]: https://chat.hedgedoc.org/dev

[github-version-badge]: https://img.shields.io/github/release/hedgedoc/hedgedoc.svg

[github-release-page]: https://github.com/hedgedoc/hedgedoc/releases

[github-release-feed]: https://github.com/hedgedoc/hedgedoc/releases.atom

[github-issue-tracker]: https://github.com/hedgedoc/hedgedoc/issues/

[poeditor-image]: https://img.shields.io/badge/POEditor-translate-blue.svg

[poeditor-url]: https://poeditor.com/join/project/1OpGjF2Jir

[hedgedoc-demo]: https://hedgedoc.org/demo/

[hedgedoc-demo-features]: https://demo.hedgedoc.org/features

[hedgedoc-community]: https://community.hedgedoc.org

[hedgedoc-community-calls]: https://community.hedgedoc.org/t/codimd-community-call/19

[social-mastodon]: https://social.hedgedoc.org/mastodon

[social-mastodon-image]: https://img.shields.io/mastodon/follow/109259563190314667?domain=https%3A%2F%2Ffosstodon.org&style=social

[reuse-workflow-badge]: https://github.com/hedgedoc/hedgedoc/workflows/REUSE%20Compliance%20Check/badge.svg

[nestjs-workflow-badge]: https://github.com/hedgedoc/hedgedoc/workflows/Nest.JS%20CI/badge.svg

[codecov-badge]: https://codecov.io/gh/hedgedoc/hedgedoc/branch/develop/graph/badge.svg?token=pdaRF4qjNQ

[codecov-url]: https://codecov.io/gh/hedgedoc/hedgedoc
