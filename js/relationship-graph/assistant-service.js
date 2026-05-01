(function initializeGraphAssistantService(global) {
    'use strict';

    class GraphAssistantService {
        constructor(options = {}) {
            this.functionName = options.functionName || 'operational-graph-assistant';
            this.getAccessToken = typeof options.getAccessToken === 'function' ? options.getAccessToken : null;
            this.runtimePromise = null;
        }

        async askGraphAssistant(payload) {
            const runtime = await this.loadSupabaseRuntime();
            if (!runtime?.url || !runtime?.anonKey) {
                throw new Error('Supabase runtime config is missing. The assistant cannot reach the server-side Gemini function.');
            }

            const accessToken = this.getAccessToken ? await this.getAccessToken() : null;
            if (!accessToken) {
                throw new Error('Log in to unlock the graph AI assistant.');
            }

            const response = await fetch(`${runtime.url}/functions/v1/${this.functionName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                    'apikey': runtime.anonKey
                },
                body: JSON.stringify(payload)
            });

            const contentType = response.headers.get('content-type') || '';
            const responseText = await response.text();
            let data = {};
            if (contentType.includes('application/json') && responseText) {
                try {
                    data = JSON.parse(responseText);
                } catch {
                    data = { error: responseText };
                }
            } else {
                data = { error: responseText };
            }

            if (!response.ok) {
                const detail = String(data?.error || '').trim();
                throw new Error(detail
                    ? `Assistant request failed with status ${response.status}: ${detail}`
                    : `Assistant request failed with status ${response.status}.`);
            }

            return data;
        }

        async loadSupabaseRuntime() {
            if (!this.runtimePromise) {
                this.runtimePromise = this.fetchSupabaseRuntime();
            }
            return this.runtimePromise;
        }

        async fetchSupabaseRuntime() {
            const [runtime, config] = await Promise.allSettled([
                fetch('content/auth.runtime.json', { cache: 'no-store' }),
                fetch('content/auth.config.json', { cache: 'no-store' })
            ]);

            let runtimePayload = null;
            if (runtime.status === 'fulfilled' && runtime.value.ok) {
                runtimePayload = await runtime.value.json();
            }

            let configPayload = null;
            if (config.status === 'fulfilled' && config.value.ok) {
                configPayload = await config.value.json();
            }

            const url = runtimePayload?.supabase?.url || configPayload?.supabase?.url || '';
            const anonKey = runtimePayload?.supabase?.anonKey || configPayload?.supabase?.anonKey || '';

            return { url, anonKey };
        }
    }

    global.GraphAssistantService = GraphAssistantService;
})(window);
