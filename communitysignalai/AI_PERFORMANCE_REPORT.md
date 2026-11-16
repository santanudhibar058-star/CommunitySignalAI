# PeopleCare AI response performance

Measured on 2026-11-14 through the Flask streaming endpoint with its local model already warm. The browser and network transport were not included.

## Provider and model

- Provider: local Ollama (auto selected Ollama because no cloud API credential is configured).
- Model: **qwen3:4b-instruct**, Q4_K_M, CPU-only on this machine.
- Ollama keep-alive: 30 minutes.
- The official Qwen3 Instruct variant is intended for non-thinking responses; see the [Ollama model tags](https://ollama.com/library/qwen3/tags) and [Qwen3 release notes](https://github.com/QwenLM/Qwen3).

## Warm response samples

| Request | First visible answer text | Completion | Output |
| --- | ---: | ---: | ---: |
| General science question | 514 ms | 5.32 s | 58 tokens |
| Contextual follow-up | 377 ms | 4.65 s | 51 tokens |
| Python function and example | 549 ms | 7.83 s | 86 tokens |
| Hindi question | 1.26 s | 13.58 s | 127 tokens |
| **Mean** | **675 ms** | **7.84 s** | — |

These samples achieved the 1–2 second first-text target while the model was warm. They do not guarantee the same result on a cold start, another computer, or another prompt. Measured generation throughput was about 10.3–12.1 tokens/second.

## Changes that reduce latency

- Load an installed local model in the background when the assistant opens, with the same 8,192-token context used for chat.
- Keep the model resident for 30 minutes by default; this trades memory for avoiding repeated load time.
- Cache Ollama availability checks and skip project-file retrieval when a configured model can answer.
- Cap conversation context at 12 recent messages and 12,000 characters.
- Stream the model's text deltas directly as SSE; the frontend batches visual updates without waiting for a complete response.
- Keep ordinary local replies capped at 192 generated tokens and allow up to 1,024 for code or explicit detail.

## Quality and deployment limits

- The English science answer, its contextual follow-up, and a short Python example completed through the real backend stream.
- The Hindi sample produced Devanagari text, but its explanation incorrectly attributed moonlight to reflected Earth light. Hindi input/output works technically; factual Hindi quality is not reliable enough to claim as validated.
- This machine has no Ollama GPU allocation. Warm generation is about 10–12 tokens/second, so total completion still takes several seconds; code answers take longer than short factual answers.
- No cloud API key is configured. A server-side cloud provider can be configured for stronger general and multilingual answers, but its latency and cost depend on the selected service.
- No Codex-equivalent quality or speed is claimed. The local model is a small general assistant and can make factual mistakes; users should verify high-stakes answers.
- Cold-start time for the newly installed Instruct model was not included in the table.
