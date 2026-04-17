(function initializeGraphPromptBuilder(global) {
    'use strict';

    function buildAssistantRequest({ userQuestion, conversationHistory, queryContext }) {
        return {
            question: userQuestion,
            conversationHistory: conversationHistory.slice(-8).map(message => ({
                role: message.role,
                text: message.text
            })),
            graphContext: queryContext
        };
    }

    global.GraphPromptBuilder = {
        buildAssistantRequest
    };
})(window);
