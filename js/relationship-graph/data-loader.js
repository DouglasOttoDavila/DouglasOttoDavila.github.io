(function initializeRelationshipGraphDataLoader(global) {
    'use strict';

    const DEFAULT_DATASET_URL = 'docs/relationship-graph-refactor/operational-context-graph.dataset.json';

    async function loadOperationalGraphDataset(datasetUrl = DEFAULT_DATASET_URL) {
        const response = await fetch(datasetUrl, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Failed to load graph dataset: ${response.status}`);
        }

        const parsed = await response.json();
        if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.links)) {
            throw new Error('Graph dataset is missing required nodes/links arrays.');
        }

        return parsed;
    }

    global.RelationshipGraphDataLoader = {
        DEFAULT_DATASET_URL,
        loadOperationalGraphDataset
    };
})(window);
