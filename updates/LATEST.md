# AI updates check: 2026-11-16

## ChatGPT app

Couldn't read this page this time. It will be tried again next run.

## Claude app

Source: https://support.claude.com/en/articles/12138966-release-notes

- November 12, 2026
- Claude Meetings is rolling out in beta on Team and Enterprise plans in Claude and Claude Desktop. You can add Claude to a Google Meet call as a visible participant that takes notes, answers questions, and builds artifacts, such as docs, whiteboards, and slides, during the call. For more information, see Use Claude Meetings.
- Why Claude switched models in your conversation with Opus 5 or Opus 5.5
- Preserved thinking: changing how the Messages API handles thinking blocks to protect against distillation

## Claude API

Source: https://platform.claude.com/docs/en/release-notes/overview.md

- November 12, 2026
- We’ve launched [self-hosted Claude Managed Agents]. You run the whole Managed Agents service, not only [self-hosted sandboxes], on your own infrastructure, and you store agents, sessions, and session history there. The server sends model requests to the provider that you choose, which is Anthropic by default. To request access, contact your Anthropic account team.
- November 9, 2026
- We’ve launched **Claude Fable 5.2** (`claude-fable-5-2`), built for demanding reasoning and long-horizon agentic work. **Claude Mythos 5.2** (`claude-mythos-5-2`) offers the same capabilities only to organizations verified through Anthropic’s verification programs, such as the [Cyber Verification Program]. Both models have a [1M token context window], 128k max output tokens, and always-on [adaptive thinking]. They cost $8 USD per MTok of input and $40 USD per MTok of output (Claude Fable 5.1 and Claude Mythos 5.1 cost $10 USD per MTok of input and $50 USD per MTok of output). Claude Fable 5.2 is available on the Claude API, [Amazon Bedrock (`bedrock-runtime`)], [Claude Platform on AWS], [Claude Models on Google Cloud (Anthropic managed)], [Claude Models on Google Cloud (Google managed)], and [Claude in Microsoft Foundry]. See [What’s new in Claude Fable 5.2] for API changes and migration guidance. For model-specific prompting patterns, see [Prompting Claude Fable 5.2].
- Claude Fable 5.2 and Claude Mythos 5.2 enforce the [prefix check] for every account, whatever its age. Claude Fable 5.1 returns the error by default on accounts created on or after August 31, 2026 (see [When `prefix_mismatch_behavior` is unset]). If your code edits the `system` prompt, `tools`, or an earlier message and then sends back a Claude Fable 5.2 or Claude Mythos 5.2 thinking block from a later turn, the request returns a 400 error. Before you switch, [check whether your code edits the prefix].
- Claude Fable 5.2 and Claude Mythos 5.2 read other models’ thinking blocks on the Claude API and Claude Models on Google Cloud (Google managed). So on those platforms, a conversation that moves onto either model keeps its reasoning. The other models include Claude Opus 5.5, Claude Sonnet 5.5, and Claude Haiku 5.5.
- No other model reads thinking blocks from Claude Fable 5.2 or Claude Mythos 5.2. When a conversation moves from either one to a model outside this pair, the API drops those blocks. That includes a move to Claude Opus 5.5 or Claude Fable 5.1. The request still succeeds. See [Switching models mid-conversation].
- Claude Fable 5.2 and Claude Mythos 5.2 support computer use through the `computer_toolset_20260801` toolset. A request that declares the earlier `computer_20251124` tool returns a 400 error on every platform except Amazon Bedrock, where the earlier tool still works. See [Migrate from `computer_20251124`].
- With the [advisor tool], which is in beta, a Claude Fable 5.2 or Claude Mythos 5.2 executor accepts only Claude Fable 5.2 or Claude Mythos 5.2 as its advisor. Any other advisor returns a 400 error, so set the advisor’s `model` to one of these two models when you move an executor to them. Every executor model accepts Claude Fable 5.2 as its advisor. See [Model compatibility].
- Both models require 30-day data retention, like Claude Fable 5.1 and Claude Mythos 5.1. They aren’t available under zero data retention unless expressly authorized by Anthropic. See [Model-specific data retention requirements].
- Thinking blocks that Claude Fable 5.2 and Claude Mythos 5.2 produce work only in the account that produced them, or in an account linked to it. See [Preserved thinking].
- [Dreams] (research preview) now supports Claude Fable 5.2. See [Supported models].
- We’ve launched [fast mode] for Claude Fable 5.2 in Messages API requests on the Claude API. Fast mode delivers up to 2.5x higher output tokens per second, at $16 USD per MTok of input and $80 USD per MTok of output. Set `speed: "fast"` on your request, with no beta header.
- The [Compliance API] now includes Security posture data, in beta for Claude Enterprise organizations. The [Activity Feed] records changes to attestations on the **Security posture** page in claude.ai **Organization settings**. The `GET /v1/compliance/organizations/{organization_id}/security_posture` endpoint returns an organization’s current Security posture results. See [Security posture in the Compliance API].
- We’ve launched **Claude Fable 5.1** (`claude-fable-5-1`), the successor to Claude Fable 5 for long-running agentic coding, knowledge work, and research. For Project Glasswing participants, we’ve also launched **Claude Mythos 5.1** (`claude-mythos-5-1`). Both models support a [1M token context window] by default, 128k max output tokens, and always-on [adaptive thinking]. They cost $10 / $50 USD per MTok, the same as Claude Fable 5, with cache reads cut to $0.25 USD per MTok. Claude Fable 5.1 is available on the Claude API, [Claude in Amazon Bedrock], and [Claude Platform on AWS]. It’s also on [Claude Models on Google Cloud (Google managed)] and [Claude in Microsoft Foundry]. See [Claude Fable 5.1] for specifications.
- We’ve launched **Claude Opus 5** (`claude-opus-5`), a step-change improvement over Claude Opus 4.8. Claude Opus 5 supports a [1M token context window] (both the default and the maximum), 128k max output tokens, and [thinking] on by default, at $5 / $25 USD per MTok, the same pricing as Claude Opus 4.8. It’s available on the Claude API, [Claude in Amazon Bedrock], [Claude Platform on AWS], [Claude Models on Google Cloud (Google managed)], and [Claude in Microsoft Foundry]. See [Claude Opus 5] and the [models overview] for complete specs.
- On Claude Opus 5, disabling thinking is allowed only at effort `high` or below: `thinking: {"type": "disabled"}` with effort `xhigh` or `max` returns a 400 error, a breaking change from Claude Opus 4.8. See [Effort with thinking].
- We’ve launched **Claude Sonnet 5** (`claude-sonnet-5`), the next generation of our Sonnet model family, at introductory pricing of $2 / $10 USD per MTok (made the standard price on August 10, 2026). Claude Sonnet 5 supports a [1M token context window], 128k max output tokens, and the same set of tools and platform features as Claude Sonnet 4.6, except [Priority Tier], which is not available on Claude Sonnet 5. Three behavior changes apply when migrating: [adaptive thinking] is now on by default; manual extended thinking (`thinking: {type: "enabled", budget_tokens: N}`) is removed and returns a 400 error (it was deprecated on Sonnet 4.6); and setting sampling parameters (`temperature`, `top_p`, `top_k`) to non-default values returns a 400 error. Claude Sonnet 5 also uses a new tokenizer that produces approximately 30% more tokens for the same text. The exact increase depends on the content and workload shape. See [Claude Sonnet 5] for details. For behavioral differences and model-specific prompting patterns, see [Prompting Claude Sonnet 5].

## OpenAI API

Source: https://developers.openai.com/api/docs/changelog

- Use [GPT-6 Cyber] to investigate vulnerabilities, reproduce them in an authorized test environment, and verify fixes. See [Daybreak setup] before sending your first request.
- Released [GPT-Image-2.6 Sunburst] and [GPT-Image-2.6 Flare] for image generation and editing, with adjustable complexity, SVG generation, and animated GIF generation. Added markup-guided editing for supported GPT-Image-2.5 and GPT-Image-2.6 models.
- [GPT-Live-1] is now generally available in the API. Build full-duplex voice conversations that can continue while a backend model or agent handles reasoning and tools.
- Released [GPT-Image-2.5 Sunburst] and [GPT-Image-2.5 Flare] for image generation and editing through the Image API and the Responses API image generation tool.
- Released [GPT-Transcribe] for accurate file transcription and final transcripts of committed Realtime turns, along with [GPT-Live-Transcribe] for low-latency streaming transcription.
- Released [GPT-5 pro], a version of [GPT-5] that uses more compute to think harder and provide consistently better answers.
- Released [GPT-4 Turbo preview], [updated GPT-3.5 Turbo], [GPT-4 Turbo with Vision], [Assistants API], [DALL·E 3 in the API], and [text-to-speech API]

## Pages that couldn't be read

- ChatGPT app: couldn't read https://help.openai.com/en/articles/6825453-chatgpt-release-notes (HTTPError: HTTP Error 403: Forbidden)

## Next step

For each new feature, check if it appears in the Claude API or OpenAI API section. If it does, Sabeel can add it. See docs/UPDATES.md for the ready prompt.
