# Chat UI layout — direction & current state

Context for the assistant chat's "rich UI" rendering. Today the model emits
` ```ui ` DSL blocks (`lib/v2/chat/ui-dsl/`) rendered by
`components/chatbot/DSLRenderer.tsx`, interleaved with markdown prose/tables.

## The problem

Layout order is currently determined by **where the model emits each ` ```ui `
block in the token stream**, which conflates two concerns that should be
separate:

- **Content** — what data to show (the model's job).
- **Presentation hierarchy** — what sits where (should be the client's job).

Symptom that kicked this off: summary metrics (`stat-grid`) sometimes land
_after_ a markdown table, which reads as a strange hierarchy.

Guiding principle (same one MCP Apps UI resources, the OpenAI Apps SDK, and AI
SDK generative UI bake in): **the model produces content; the client owns
layout.**

## What we tried and reverted: render-time hoist

A `splitHoistedStatGrids` helper in `AssistantMessage.tsx` pulled bare top-level
`stat-grid` fences to the top of the response (with a carve-out to keep a leading
intro paragraph above them, and leaving card-nested grids in place).

**Reverted** because it was the wrong layer: it accreted heuristics (regex over
streaming text, structural-line detection, lead-paragraph peeling) to make a
_generic primitive reorderer_ approximate a layout that really wants a dedicated
component. It also can't reach the quality bar we're targeting (see the
Claude-desktop vendor summary). Kept the genuinely-good byproduct — the
streaming-stability fix (module-scope `MARKDOWN_COMPONENTS` + `MarkdownStreamContext`),
which stops the markdown re-render from remounting charts/grids on every token.

## The real decision: three mechanisms, pick per use case

The DSL is not the only option, and it's the awkward middle of three:

| Mechanism                                                                                       | Flexibility              | Data grounding                        | Charts / links / icons                                                         | Security                        |
| ----------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------- |
| **Grounded React component** over MCP tool output (e.g. `VendorOverview` ← `get_vendor`)        | Low (bespoke per intent) | **Strong** (renders tool data)        | All native (recharts, ContractLink, VendorIcon)                                | None                            |
| **DSL primitives** (current)                                                                    | Medium (model assembles) | Weak (model-authored)                 | Native React                                                                   | Low (Zod-validated)             |
| **Streaming HTML iframe** (Claude Desktop pattern; see `~/Downloads/streaming-html-widgets.md`) | High (any layout)        | Weak (model writes numbers into HTML) | **Lost** — no recharts, no client routing, no React; needs postMessage bridges | High (sandbox must be airtight) |

Key correction discovered while investigating: the `TOOL_REGISTRY` renderers
(`SpendSummary`, `PaymentTermsSummary`, `SynthesisSummary`, …) are **dormant**.
They're keyed to the previous assistant's local `getChatTools` names
(`calculate_spend`, `query_tags`, …). The live stream
(`app/api/v2/handlers/chat/stream.ts`) wires `getMcpToolsForChat` → MCP tool
names (`get_vendor`, `get_spend`, `list_tags`, …). Only `list_contracts`
overlaps. So in the current path the rich output is entirely the model's
synthesized markdown + DSL; the registry components almost never fire (and even
when matched, they render inside a tool accordion, not as a hero).

### Recommended direction

1. **Charts → stay in React/recharts.** Streaming HTML is _worse_ for real
   interactive charts (tooltips, legends, the axis work already done). Keep the
   DSL `chart` primitive / chart components.
2. **High-frequency hero summaries (vendor, contract) → grounded React component
   over MCP tool output.** This is the reliable way to hit the Claude-desktop
   quality bar and keeps links/icons/charts native. `get_vendor`
   (`app/lib/mcp/tools/vendors.ts:235-251`) already returns essentially every
   field in the LexisNexis screenshot — header (name/domain/ictProvider), TCV,
   contractCount, relationshipLength, relationship start/projected-end (Timeline
   panel), per-contract status (Active/Unconfirmed breakdown), products (pills).
   Annual spend = sum of `contracts[].currentAnnualSpendUSD` excluding
   superseded / linked-invoice rows. So `VendorOverview` is a **new renderer over
   existing tool output — no new tool needed.**
3. **Streaming HTML iframe → future escape hatch** for genuinely unpredictable
   long-tail layouts, _if_ that need materializes. Great pattern, but not worth
   the sandbox + lost-React cost as the primary mechanism for a domain app with
   known intents.

## Chosen transport: AI SDK custom data parts (not DSL fences)

We're on AI SDK v6 (`ai@^6`, `@ai-sdk/react@^3`) and already use
`createUIMessageStream` for the static/greeting/nav shortcuts. The artifacts
_feature_ (chatbot.ai-sdk.dev) — side-panel canvas, version history, diff mode,
a `Document` table — is overkill, but the transport it's built on, **custom data
parts**, is exactly the channel the DSL-in-markdown approach was missing.

Instead of the model embedding ` ```ui ` JSON in the prose token stream, the
server emits a typed `data-*` part via `writer.write({ type: 'data-vendorOverview', id, data })`.
It arrives as a discrete, id-keyed entry in `message.parts`, **out of band from
the text stream**:

- Ordering is emission order — the tool's part lands before narration, no hoist.
- No remount/flicker — a data part is a stable object updated by `id`, not a
  re-parsed growing string.
- Grounded — written from the tool's structured output, not model-authored.
- SDK-native — this is the "explicit regions" idea with the wire format already
  provided.

### Wiring (traced against current `stream.ts`)

Main path today is `startStreamText(...).toUIMessageStreamResponse()`
(`stream.ts:426-433`) — a bare `streamText` result, no `writer`. `onStepFinish`
(`stream.ts:334`) already receives `event.toolResults` (`{ toolName, output }`).

Two ways to emit parts; **Option B chosen** (localized, leaves mcp-adapter pure):

- **Option A** — thread `writer` into `getMcpToolsForChat(user, tokenId, writer)`
  and have hero tools write their own part in `mcp-adapter.ts` execute.
- **Option B (chosen)** — wrap the main path in `createUIMessageStream({ execute })`,
  `writer.merge(result.toUIMessageStream())`, and in `onStepFinish` (closing over
  `writer`) emit `data-<kind>` for tool results whose `toolName` has a registered
  hero (e.g. `get_vendor` → `data-vendorOverview`). Model calls the tool normally;
  we surface its output as a typed part.

Also fold `buildNavigationStreamResponse` (currently smuggles
`{action:'navigate'}` through a _text_ part) into a proper `data-navigate` part.

### Charts: shadcn chart is the renderer, not an alternative transport

`components/ui/chart.tsx` **is** the shadcn chart component (recharts wrapper +
theming + tooltip/legend helpers). `DSLRenderer`'s `ChartRenderer` already renders
through `ChartContainer`. "shadcn chart vs DSL chart" is a category error — the
DSL chart is a _transport_ (a `ChartBlock` schema), shadcn is the _rendering
layer_ it sits on. Under data parts, a `data-chart` part (or chart data straight
from a tool) renders via the same `ChartContainer`. The chart visuals don't
change.

### Minimal vertical slice (additive, doesn't touch existing DSL/markdown path)

1. `stream.ts`: wrap main path in `createUIMessageStream`; emit
   `data-vendorOverview` from `onStepFinish` when `get_vendor` runs.
2. `VendorOverview` component (shadcn Card/Badge + stat tiles) rendering the
   part's `data` (grounded from `get_vendor`, `vendors.ts:235-251`).
3. `AssistantMessage`: type `UIMessage<…, DataParts>`; render `data-vendorOverview`
   parts in `message.parts` order, keep markdown for everything else.
4. One prompt line: for a vendor overview, call `get_vendor` and narrate — don't
   re-list metrics, the UI renders them.

### Open decisions

- **Persistence** — data parts can be transient or kept in message history.
  Decide whether the hero should survive reload (persist) or live only in the
  live stream; touches how messages are stored.
- **Interactivity** — action buttons (Chat SDK lesson) render as real shadcn
  `Button`/`Dialog` with `onClick` → Next router / `useChat().sendMessage`
  (prompt-actions) / Dialog. Typed action protocol: `{ kind: 'prompt' | 'navigate' | 'modal', id, label, … }`.

Revisit once the slice is built and evaluated against current output.
