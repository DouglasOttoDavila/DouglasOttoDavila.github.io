(function initializeGraphChatPanel(global) {
    'use strict';

    function createId() {
        return global.crypto?.randomUUID?.() || `graph-message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function formatMessageText(value) {
        return escapeHtml(value).replace(/\r?\n/g, '<br>');
    }

    class GraphChatPanel {
        constructor(options) {
            this.root = options.root;
            this.graphController = options.graphController;
            this.contextProvider = options.contextProvider;
            this.promptBuilder = options.promptBuilder;
            this.assistantService = options.assistantService;
            this.actionInterpreter = options.actionInterpreter;
            this.messages = [];
            this.abortController = new AbortController();

            this.messagesEl = this.root.querySelector('#relationship-graph-chat-messages');
            this.formEl = this.root.querySelector('#relationship-graph-chat-form');
            this.inputEl = this.root.querySelector('#relationship-graph-chat-input');
            this.submitEl = this.root.querySelector('#relationship-graph-chat-submit');
            this.clearEl = this.root.querySelector('#relationship-graph-chat-clear');
            this.statusEl = this.root.querySelector('#relationship-graph-chat-status');
            this.availabilityEl = this.root.querySelector('#relationship-graph-assistant-availability');

            this.seedWelcomeMessage();
            this.bindUI();
            this.setStatus('');
            this.setAvailability('Ready', 'success');
            this.renderMessages();
        }

        seedWelcomeMessage() {
            this.messages.push({
                id: createId(),
                role: 'assistant',
                text: 'I can answer questions about this fictional operational graph and drive safe graph actions like focus, highlight, neighborhood inspection, node-type filtering, and path emphasis.',
                createdAt: new Date().toISOString(),
                referencedNodeIds: ['deploy-2026-02-03', 'defect-access-cache', 'feature-access-control']
            });
        }

        bindUI() {
            const signal = this.abortController.signal;

            this.formEl?.addEventListener('submit', event => {
                event.preventDefault();
                const value = String(this.inputEl?.value || '').trim();
                if (!value) return;
                this.handleSubmit(value);
            }, { signal });

            this.inputEl?.addEventListener('keydown', event => {
                if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
                event.preventDefault();
                this.formEl?.requestSubmit();
            }, { signal });

            this.clearEl?.addEventListener('click', () => {
                this.messages = [];
                this.graphController.resetAssistantTransientState();
                this.seedWelcomeMessage();
                this.setStatus('Chat cleared. Assistant-applied highlights remain active until the page is refreshed.', 'info');
                this.renderMessages();
            }, { signal });

            this.messagesEl?.addEventListener('click', event => {
                const nodeButton = event.target.closest('[data-chat-node-id]');
                if (nodeButton) {
                    this.graphController.selectNode(nodeButton.getAttribute('data-chat-node-id'), true, 'assistant');
                    this.graphController.highlightNodes([nodeButton.getAttribute('data-chat-node-id')]);
                    this.graphController.refreshVisualState();
                    this.setStatus(`Focused on ${nodeButton.textContent.trim()}.`, 'success');
                }
            }, { signal });
        }

        async handleSubmit(text) {
            const userMessage = {
                id: createId(),
                role: 'user',
                text,
                createdAt: new Date().toISOString()
            };

            this.messages.push(userMessage);
            this.renderMessages();
            this.setLoading(true);
            this.setStatus('Thinking with graph context...', 'loading');
            if (this.inputEl) {
                this.inputEl.value = '';
            }

            try {
                const queryContext = this.contextProvider.buildQueryContext(text, this.messages);
                const requestPayload = this.promptBuilder.buildAssistantRequest({
                    userQuestion: text,
                    conversationHistory: this.messages,
                    queryContext
                });

                const assistantResponse = await this.assistantService.askGraphAssistant(requestPayload);
                const actionFeedback = this.actionInterpreter.applyActions(assistantResponse.actions || []);
                const assistantMessage = {
                    id: createId(),
                    role: 'assistant',
                    text: assistantResponse.answer || 'No response returned.',
                    createdAt: new Date().toISOString(),
                    referencedNodeIds: assistantResponse.referencedNodeIds || [],
                    actions: assistantResponse.actions || [],
                    actionFeedback: [
                        ...actionFeedback.applied,
                        ...actionFeedback.ignored
                    ]
                };

                this.messages.push(assistantMessage);
                this.renderMessages();
                this.setStatus(
                    actionFeedback.applied.length > 0 ? actionFeedback.applied.join(' ') : 'Assistant responded without graph changes.',
                    actionFeedback.applied.length > 0 ? 'success' : 'warning'
                );
            } catch (error) {
                this.messages.push({
                    id: createId(),
                    role: 'assistant',
                    text: String(error?.message || 'Assistant request failed.'),
                    createdAt: new Date().toISOString(),
                    isError: true
                });
                this.renderMessages();
                this.setStatus('Assistant request failed. Check the message above and try again.', 'error');
            } finally {
                this.setLoading(false);
            }
        }

        renderMessages() {
            if (!this.messagesEl) return;
            this.messagesEl.innerHTML = this.messages.map(message => {
                const referenceChips = Array.isArray(message.referencedNodeIds) && message.referencedNodeIds.length > 0
                    ? `
                        <div class="relationship-graph-chat-message__references">
                            ${message.referencedNodeIds
                                .map(nodeId => this.graphController.getNodeById(nodeId))
                                .filter(Boolean)
                                .map(node => `
                                    <button class="relationship-graph-chat-chip" type="button" data-chat-node-id="${node.id}">
                                        ${node.label}
                                    </button>
                                `).join('')}
                        </div>
                    `
                    : '';

                const actionFeedback = Array.isArray(message.actionFeedback) && message.actionFeedback.length > 0
                    ? `
                        <ul class="relationship-graph-chat-message__actions">
                            ${message.actionFeedback.map(line => `<li>${line}</li>`).join('')}
                        </ul>
                    `
                    : '';

                return `
                    <article class="relationship-graph-chat-message relationship-graph-chat-message--${message.role}${message.isError ? ' relationship-graph-chat-message--error' : ''}">
                        <div class="relationship-graph-chat-message__meta">
                            <span>${message.role === 'assistant' ? 'Assistant' : 'You'}</span>
                            <time>${new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                        </div>
                        <p class="relationship-graph-chat-message__text">${formatMessageText(message.text)}</p>
                        ${referenceChips}
                        ${actionFeedback}
                    </article>
                `;
            }).join('');

            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        }

        setStatus(message, tone = 'info') {
            if (!this.statusEl) return;
            const normalizedMessage = String(message || '').trim();
            this.statusEl.textContent = normalizedMessage;
            this.statusEl.dataset.statusTone = tone;
            this.statusEl.classList.toggle('is-hidden', !normalizedMessage);
        }

        setAvailability(message, tone = 'success') {
            if (!this.availabilityEl) return;
            this.availabilityEl.textContent = message;
            this.availabilityEl.dataset.statusTone = tone;
        }

        setLoading(isLoading) {
            if (this.submitEl) {
                this.submitEl.disabled = isLoading;
            }
            if (this.inputEl) {
                this.inputEl.disabled = isLoading;
            }
            this.setAvailability(isLoading ? 'Thinking' : 'Ready', isLoading ? 'loading' : 'success');
        }

        destroy() {
            this.abortController.abort();
        }
    }

    global.GraphChatPanel = GraphChatPanel;
})(window);
