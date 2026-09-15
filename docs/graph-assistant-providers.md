# Graph assistant providers

The hosted `operational-graph-assistant` Edge Function defaults to NVIDIA's `nvidia/nemotron-3-ultra-550b-a55b` model at `https://integrate.api.nvidia.com/v1/chat/completions`. Gemini is preserved as an explicit alternative. There is no automatic provider fallback.

## Store the credential

1. Generate an API key from https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b (sign into NVIDIA and select Generate API Key).
2. Open https://supabase.com/dashboard/project/zlixsxbovbshsyptxymp/functions/secrets.
3. Add a secret named `NVIDIA_API_KEY` (no dollar sign), paste the key as its value, and save.
4. Refresh the portfolio and submit a new assistant execution. An already failed execution ID cannot dispatch again.

Secrets are read server-side through Deno.env. Never put this credential in auth.runtime.json, browser code, PUBLIC_ variables, Git, or chat. The local Astro site calls the hosted function, so a frontend .env is not the correct place. Supabase applies saved function secrets without requiring another deployment.

## Optional settings

| Secret | Default | Purpose |
| --- | --- | --- |
| GRAPH_ASSISTANT_PROVIDER | nvidia | Set to gemini to switch back explicitly |
| NVIDIA_MODEL | nvidia/nemotron-3-ultra-550b-a55b | NVIDIA model identifier |
| NVIDIA_API_KEY | required for NVIDIA | Server-side credential |
| GEMINI_MODEL | gemini-2.5-flash | Preserved Gemini model |
| GEMINI_API_KEY | required for Gemini | Existing secret retained |

The provider configuration is checked before reserving an execution. A dispatched provider failure still consumes an execution under the existing quota policy. The 65-second upstream timeout stays below the browser's 90-second request timeout. NVIDIA thinking is disabled and response generation is capped at 4096 tokens. Answers must parse as JSON and pass structural checks; graph actions/references still pass the existing graph-aware normalization.

## Diagnosis and validation

The latest September 14 failure in lab_executions was `Signal timed out.` on Gemini. GEMINI_API_KEY was present. Earlier July records included referrer-blocked keys, followed by successful executions; they are not evidence for the latest failure. The visible repeated-request error was the persisted failure being replayed.

Deployed only operational-graph-assistant. Provider and Edge tests pass with mocked upstream requests; a real NVIDIA response cannot be validated until the user stores the key. Existing Gemini secret remains untouched.

Sources: https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b and https://supabase.com/docs/guides/functions/secrets

## Model selectors — September 14, 2026

Site settings now contains a per-account saved model preference for every approved Lab user. Administrative controls remain admin-only. The graph has an independent per-visit override; reopening the route resets it to the saved default. Requests snapshot their effective model, and model/provider participate in the idempotency hash. Responses include the actual model. Credentials remain server-side.

NVIDIA's Free Endpoint filter showed 35 models. Fourteen general-purpose chat candidates appeared in its chat-completions model list; nine returned structurally valid JSON for a synthetic graph prompt within 65 seconds. The server and UI select only those nine. This is a dated smoke-test snapshot, not a guarantee of uptime or complex-question quality. See `nvidia-model-checks-2026-09-14.json` for every candidate result. Diagnostics did not consume portfolio Lab allowances; they used NVIDIA's free endpoint capacity.

Selectable: nvidia/nemotron-3-super-120b-a12b; meta/llama-3.2-90b-vision-instruct; meta/llama-3.2-11b-vision-instruct; mistralai/mistral-nemotron; deepseek-ai/deepseek-v4-flash-0731; moonshotai/kimi-k3; poolside/laguna-xs-2.1; meta/muse-glimmer-30b; nvidia/nemotron-3.5-lightning-30b-a3b.

Ultra and Nano Omni returned HTTP 503. GPT-OSS 20B, Gemma 4, and DiffusionGemma exceeded the timeout. Ultra remains recorded in the candidate catalog but is not selectable while unverified; Nemotron Super is the fallback. Existing unavailable preferences are retained in storage and reported visibly rather than silently rewritten.

The remaining 21 free endpoints target moderation, translation, speech/audio, embeddings, image-only understanding, quantum calibration, autonomous driving, or physical-world perception/generation. They are not substitutes for this graph assistant and are not placed in its selector.

Maintain the dated allowlist in `supabase/functions/_shared/nvidia-models.json` after rechecking NVIDIA's Free Endpoint catalog and running server-side synthetic graph probes. Include only successful probes. Do not enable arbitrary IDs from the broader /v1/models list: that list is not proof of the Free Endpoint badge. The temporary deployment diagnostic endpoint and secret were removed after checking.

The model-preference schema is deployed using `scripts/deploy-model-preferences.mjs`; CI applies it before deploying Edge Functions. The table has RLS and no browser grants. Its service-only RPC receives the authenticated user's ID from the Edge Function, never from a client-supplied user ID. Gemini remains available through GRAPH_ASSISTANT_PROVIDER=gemini for calls without an explicit NVIDIA model; the new selectors intentionally list only NVIDIA free models.
