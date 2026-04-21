(function initializeRelationshipGraphDetails(global) {
    'use strict';

    const graphConfig = global.RelationshipGraphConfig;

    const FACT_LABELS = {
        automationStatus: 'Automation',
        methodSet: 'Methods',
        priority: 'Priority',
        releaseTrain: 'Release train',
        referencedType: 'Referenced class',
        severity: 'Severity',
        status: 'Status'
    };

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatValue(value) {
        if (Array.isArray(value)) {
            return value.map(item => escapeHtml(item)).join(' • ');
        }
        if (typeof value === 'boolean') {
            return value ? 'Yes' : 'No';
        }
        return escapeHtml(value);
    }

    function getEndpointId(endpoint) {
        return endpoint?.id || endpoint;
    }

    function toFactListItems(node) {
        const skippedKeys = new Set(['productId']);
        return Object.entries(node.attributes || {})
            .filter(([key]) => !skippedKeys.has(key))
            .map(([key, value]) => `
                <li>
                    <strong>${escapeHtml(FACT_LABELS[key] || graphConfig.humanizeConstant(key))}:</strong>
                    ${formatValue(value)}
                </li>
            `)
            .join('');
    }

    function buildSelectedNodeState(nodeId, dataset) {
        const node = dataset.nodeById.get(nodeId);
        if (!node) return null;

        const groupedConnections = new Map();
        let connectedCount = 0;

        dataset.links.forEach(link => {
            const sourceId = getEndpointId(link.source);
            const targetId = getEndpointId(link.target);
            const isSource = sourceId === nodeId;
            const isTarget = targetId === nodeId;
            if (!isSource && !isTarget) return;

            const neighborId = isSource ? targetId : sourceId;
            const neighbor = dataset.nodeById.get(neighborId);
            if (!neighbor) return;

            connectedCount += 1;
            const groupTitle = isSource ? link.label : (link.inverseLabel || link.label);
            const groupKey = `${groupTitle}__${link.type}`;

            if (!groupedConnections.has(groupKey)) {
                groupedConnections.set(groupKey, {
                    key: groupKey,
                    title: groupTitle,
                    items: []
                });
            }

            groupedConnections.get(groupKey).items.push({
                id: neighbor.id,
                label: neighbor.label,
                type: neighbor.type,
                displayType: neighbor.displayType
            });
        });

        const relationGroups = Array.from(groupedConnections.values())
            .map(group => ({
                ...group,
                items: group.items.sort((left, right) => left.label.localeCompare(right.label))
            }))
            .sort((left, right) => right.items.length - left.items.length || left.title.localeCompare(right.title));

        return {
            node,
            connectedCount,
            relationGroupCount: relationGroups.length,
            relationGroups
        };
    }

    function renderEmptyPanel(dataset) {
        const anchorNodes = dataset.nodes
            .filter(node => ['AICapability', 'Requirement', 'Defect', 'Product'].includes(node.type))
            .sort((left, right) => right.connectionCount - left.connectionCount)
            .slice(0, 4)
            .map(node => `<li>${escapeHtml(node.label)} <span>${escapeHtml(node.displayType)}</span></li>`)
            .join('');

        return `
            <div class="relationship-graph-panel__inner">
                <p class="relationship-graph-kicker">Details</p>
                <h2 class="relationship-graph-panel__title">Select a node</h2>
                <p class="relationship-graph-panel__text">Inspect a connected slice of the fictional delivery ecosystem and see how operational context can support AI-assisted engineering and QA workflows.</p>
                <div class="relationship-graph-panel__placeholder">
                    <span class="relationship-graph-panel__placeholder-icon"><i class="fa-solid fa-sitemap" aria-hidden="true"></i></span>
                    <p class="mb-0">Good starting points: follow a requirement into its API and tests, inspect an open defect into RCA and deployment context, or open an AI capability to see which context it depends on.</p>
                </div>
                <div class="relationship-graph-panel__section">
                    <h3 class="relationship-graph-panel__section-title">Suggested anchors</h3>
                    <ul class="relationship-graph-panel__list">${anchorNodes}</ul>
                </div>
            </div>
        `;
    }

    function renderSelectedNodePanel(selectedState) {
        if (!selectedState) {
            return '';
        }

        const node = selectedState.node;
        const summary = node.summary || node.description || 'No summary provided for this fictional node.';
        const factsMarkup = toFactListItems(node);
        const relationCards = selectedState.relationGroups.length > 0
            ? selectedState.relationGroups.map(group => `
                <article class="relationship-graph-panel__group-card">
                    <h4 class="relationship-graph-panel__group-title">${escapeHtml(group.title)}</h4>
                    <ul class="relationship-graph-panel__group-list">
                        ${group.items.map(item => `
                            <li>
                                <strong>${escapeHtml(item.label)}</strong>
                                <span>${escapeHtml(item.displayType)}</span>
                            </li>
                        `).join('')}
                    </ul>
                </article>
            `).join('')
            : '<p class="relationship-graph-panel__text mb-0">This node has no direct relationships in the current dataset.</p>';

        return `
            <div class="relationship-graph-panel__inner">
                <div class="relationship-graph-panel__badge-row">
                    <span class="relationship-graph-panel__badge relationship-graph-panel__badge--type">${escapeHtml(node.displayType)}</span>
                    <button class="relationship-graph-inline-reset" type="button" data-inline-reset>Clear selection</button>
                </div>
                <h2 class="relationship-graph-panel__title">${escapeHtml(node.label)}</h2>
                <p class="relationship-graph-panel__subtitle">${escapeHtml(node.type)}</p>
                <p class="relationship-graph-panel__text">${escapeHtml(summary)}</p>
                <div class="relationship-graph-panel__metrics">
                    <span><strong>${selectedState.connectedCount}</strong><span>direct links</span></span>
                    <span><strong>${selectedState.relationGroupCount}</strong><span>relationship groups</span></span>
                    <span><strong>${node.connectionCount}</strong><span>total adjacent edges</span></span>
                </div>
                ${factsMarkup ? `
                    <div class="relationship-graph-panel__section">
                        <h3 class="relationship-graph-panel__section-title">Node facts</h3>
                        <ul class="relationship-graph-panel__list">${factsMarkup}</ul>
                    </div>
                ` : ''}
                <div class="relationship-graph-panel__section">
                    <h3 class="relationship-graph-panel__section-title">Connected context</h3>
                    <div class="relationship-graph-panel__group-grid">${relationCards}</div>
                </div>
            </div>
        `;
    }

    global.RelationshipGraphDetails = {
        buildSelectedNodeState,
        renderEmptyPanel,
        renderSelectedNodePanel
    };
})(window);
