(function initializeRelationshipEntityPageFeature(global) {
    'use strict';

    const graphLoader = global.RelationshipGraphDataLoader;
    const graphAdapter = global.RelationshipGraphAdapter;
    const graphDetails = global.RelationshipGraphDetails;
    const GRAPH_FOCUS_STORAGE_KEY = 'relationship_graph_focus_node';

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function slugify(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    function humanizeList(values) {
        return values.filter(Boolean).map(value => escapeHtml(value)).join(' • ');
    }

    function getEntityIdFromUrl() {
        const fromSearch = new URLSearchParams(window.location.search).get('entity');
        if (fromSearch) return fromSearch;

        const hash = String(window.location.hash || '').replace(/^#/, '');
        const queryIndex = hash.indexOf('?');
        if (queryIndex === -1) return '';
        return new URLSearchParams(hash.slice(queryIndex + 1)).get('entity') || '';
    }

    function buildEntityHref(nodeId) {
        const baseUrl = new URL(window.location.pathname, window.location.origin);
        baseUrl.searchParams.set('entity', nodeId);
        baseUrl.hash = 'relationship-entity';
        return baseUrl.toString();
    }

    function buildGraphHref(nodeId) {
        const baseUrl = new URL(window.location.pathname, window.location.origin);
        if (nodeId) {
            baseUrl.searchParams.set('entity', nodeId);
        } else {
            baseUrl.searchParams.delete('entity');
        }
        baseUrl.hash = 'relationship-graph';
        return baseUrl.toString();
    }

    function dedupeItems(items) {
        const seen = new Set();
        return items.filter(item => {
            if (!item?.id || seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });
    }

    function flattenRelatedItems(selectedState) {
        return dedupeItems(selectedState.relationGroups.flatMap(group => group.items));
    }

    function collectItemsByType(selectedState, nodeTypes) {
        const allowed = new Set(nodeTypes);
        return dedupeItems(flattenRelatedItems(selectedState).filter(item => allowed.has(item.type)));
    }

    function deriveMockOwner(node) {
        const label = String(node.label || '').toLowerCase();
        if (node.type === 'AICapability') return 'AI Quality Lab';
        if (node.type === 'Deployment') return 'Release Management';
        if (node.type === 'Defect' || node.type === 'RCA') return 'Reliability & Triage';
        if (label.includes('access') || label.includes('auth') || label.includes('policy')) return 'Identity Platform';
        if (label.includes('sync') || label.includes('mobile')) return 'Mobile Platform';
        if (label.includes('alert') || label.includes('case')) return 'Operations Workflow';
        if (label.includes('report') || label.includes('export')) return 'Reporting Systems';
        if (node.type === 'API' || node.type === 'Service') return 'Platform Engineering';
        if (node.type === 'TestCase' || node.type === 'TestSuite') return 'Quality Engineering';
        return 'Product Delivery';
    }

    function deriveRecordId(node) {
        const token = slugify(node.label).replace(/-/g, '_').toUpperCase();
        switch (node.type) {
            case 'Product':
                return `PRD-${token}`;
            case 'Feature':
                return `FEAT-${token}`;
            case 'UserJourney':
                return `JRNY-${token}`;
            case 'Requirement':
                return node.label;
            case 'Screen':
                return `UI-${token}`;
            case 'API':
                return `API-${token}`;
            case 'Service':
                return `SVC-${token}`;
            case 'TestCase':
                return `TC-${token}`;
            case 'TestSuite':
                return `TS-${token}`;
            case 'Defect':
                return `BUG-${token}`;
            case 'RCA':
                return `RCA-${token}`;
            case 'Deployment':
                return `REL-${String(node.label).replace(/^Deployment\s+/i, '')}`;
            case 'Region':
                return `REG-${token}`;
            case 'Language':
                return `L10N-${token}`;
            case 'AICapability':
                return `AI-${token}`;
            default:
                return `CTX-${token}`;
        }
    }

    function deriveLifecycleStatus(node) {
        return node.attributes?.status
            || node.attributes?.severity
            || node.attributes?.priority
            || (node.type === 'Deployment' ? 'released' : 'active');
    }

    function deriveApiPath(node) {
        const slug = slugify(node.label)
            .replace(/^api-/, '')
            .replace(/-api$/, '')
            .replace(/-service$/, '');
        return `/v1/${slug}`;
    }

    function renderLinks(items, emptyText) {
        if (!items || items.length === 0) {
            return `<p class="relationship-entity-empty">${escapeHtml(emptyText)}</p>`;
        }

        return `
            <ul class="relationship-entity-link-list">
                ${items.map(item => `
                    <li>
                        <a href="${escapeHtml(buildEntityHref(item.id))}">
                            <strong>${escapeHtml(item.label)}</strong>
                            <span>${escapeHtml(item.displayType)}</span>
                        </a>
                    </li>
                `).join('')}
            </ul>
        `;
    }

    function renderDefinitionList(rows) {
        const filtered = rows.filter(row => row?.value);
        if (filtered.length === 0) {
            return '<p class="relationship-entity-empty">No additional mock metadata is available for this record.</p>';
        }

        return `
            <dl class="relationship-entity-definition-list">
                ${filtered.map(row => `
                    <div>
                        <dt>${escapeHtml(row.label)}</dt>
                        <dd>${row.html || escapeHtml(row.value)}</dd>
                    </div>
                `).join('')}
            </dl>
        `;
    }

    function renderSection(section) {
        return `
            <section class="relationship-entity-section">
                <p class="relationship-graph-kicker">${escapeHtml(section.kicker || 'Section')}</p>
                <h2 class="relationship-entity-section__title">${escapeHtml(section.title)}</h2>
                ${section.body}
            </section>
        `;
    }

    function buildRecordSections(node, selectedState) {
        const features = collectItemsByType(selectedState, ['Feature']);
        const journeys = collectItemsByType(selectedState, ['UserJourney']);
        const requirements = collectItemsByType(selectedState, ['Requirement']);
        const screens = collectItemsByType(selectedState, ['Screen']);
        const apis = collectItemsByType(selectedState, ['API']);
        const services = collectItemsByType(selectedState, ['Service']);
        const testCases = collectItemsByType(selectedState, ['TestCase']);
        const testSuites = collectItemsByType(selectedState, ['TestSuite']);
        const defects = collectItemsByType(selectedState, ['Defect']);
        const rcas = collectItemsByType(selectedState, ['RCA']);
        const deployments = collectItemsByType(selectedState, ['Deployment']);
        const regions = collectItemsByType(selectedState, ['Region']);
        const languages = collectItemsByType(selectedState, ['Language']);
        const aiCapabilities = collectItemsByType(selectedState, ['AICapability']);
        const nodeClasses = collectItemsByType(selectedState, ['NodeClassReference']);
        const products = collectItemsByType(selectedState, ['Product']);

        const methods = Array.isArray(node.attributes?.methodSet) ? node.attributes.methodSet : [];
        const commonMetadata = [
            { label: 'Mock record ID', value: deriveRecordId(node) },
            { label: 'Owning team', value: deriveMockOwner(node) },
            { label: 'Lifecycle', value: deriveLifecycleStatus(node) },
            { label: 'Priority', value: node.attributes?.priority || null },
            { label: 'Severity', value: node.attributes?.severity || null },
            { label: 'Release train', value: node.attributes?.releaseTrain || null },
            { label: 'Automation', value: node.attributes?.automationStatus || null },
            { label: 'Methods', value: methods.length > 0 ? methods.join(', ') : null }
        ];

        const baseOverview = renderDefinitionList(commonMetadata);
        const summaryText = node.summary || node.description || 'No summary was provided for this fictional record.';
        const defaultSections = [
            {
                kicker: 'Overview',
                title: `${node.displayType} Record`,
                body: `<p class="relationship-entity-copy">${escapeHtml(summaryText)}</p>${baseOverview}`
            },
            {
                kicker: 'Connected Records',
                title: 'Relationship Map',
                body: renderLinks(flattenRelatedItems(selectedState), 'This record has no directly connected entities.')
            }
        ];

        switch (node.type) {
            case 'Product':
                return [
                    {
                        kicker: 'Product Brief',
                        title: 'Portfolio Overview',
                        body: `<p class="relationship-entity-copy">${escapeHtml(summaryText)}</p>${baseOverview}`
                    },
                    {
                        kicker: 'Delivery Scope',
                        title: 'Features and Journeys',
                        body: renderLinks([...features, ...journeys], 'No features or journeys are connected to this product.')
                    },
                    {
                        kicker: 'Rollout',
                        title: 'Regions, Languages, and AI Support',
                        body: renderLinks([...regions, ...languages, ...aiCapabilities], 'No rollout or AI capability relationships are connected.')
                    }
                ];
            case 'Feature':
                return [
                    {
                        kicker: 'Jira-style View',
                        title: 'Feature Brief',
                        body: `<p class="relationship-entity-copy">${escapeHtml(summaryText)}</p>${baseOverview}`
                    },
                    {
                        kicker: 'Requirements',
                        title: 'Delivery Context',
                        body: renderLinks([...products, ...journeys, ...requirements], 'No product, journey, or requirement links are connected.')
                    },
                    {
                        kicker: 'Implementation',
                        title: 'Interfaces, Surfaces, and Quality',
                        body: renderLinks([...screens, ...apis, ...services, ...testCases, ...defects], 'No implementation or quality records are connected.')
                    }
                ];
            case 'UserJourney':
                return [
                    {
                        kicker: 'Journey Map',
                        title: 'Experience Overview',
                        body: `<p class="relationship-entity-copy">${escapeHtml(summaryText)}</p>${baseOverview}`
                    },
                    {
                        kicker: 'Supporting Records',
                        title: 'Surfaces and Features',
                        body: renderLinks([...features, ...screens, ...requirements], 'No connected features, screens, or requirements were found.')
                    },
                    {
                        kicker: 'Validation',
                        title: 'Related Quality Assets',
                        body: renderLinks([...testCases, ...testSuites, ...defects], 'No tests or defects are connected to this journey.')
                    }
                ];
            case 'Requirement':
                return [
                    {
                        kicker: 'Requirement Record',
                        title: 'Acceptance Intent',
                        body: `<p class="relationship-entity-copy">${escapeHtml(summaryText)}</p>${baseOverview}`
                    },
                    {
                        kicker: 'Implementation',
                        title: 'Product and Technical Coverage',
                        body: renderLinks([...features, ...screens, ...apis, ...services], 'No implementation-facing records are connected.')
                    },
                    {
                        kicker: 'Quality and Risk',
                        title: 'Validation and Incidents',
                        body: renderLinks([...testCases, ...testSuites, ...defects, ...deployments], 'No validation or incident links are connected.')
                    }
                ];
            case 'Screen':
                return [
                    {
                        kicker: 'UI Surface',
                        title: 'Screen Summary',
                        body: `<p class="relationship-entity-copy">${escapeHtml(summaryText)}</p>${baseOverview}`
                    },
                    {
                        kicker: 'Experience Context',
                        title: 'Journeys and Requirements',
                        body: renderLinks([...journeys, ...requirements, ...features], 'No journey or requirement records are connected.')
                    },
                    {
                        kicker: 'Downstream Effects',
                        title: 'Supporting APIs and Tests',
                        body: renderLinks([...apis, ...testCases, ...defects], 'No APIs, tests, or defects are connected to this screen.')
                    }
                ];
            case 'API':
                return [
                    {
                        kicker: 'Platform Doc',
                        title: 'Mock API Contract',
                        body: `
                            <p class="relationship-entity-copy">${escapeHtml(summaryText || 'This fictional API mediates operational context between UI surfaces and platform services.')}</p>
                            ${renderDefinitionList([
                                ...commonMetadata,
                                { label: 'Endpoint', value: deriveApiPath(node) },
                                { label: 'Auth model', value: node.label.toLowerCase().includes('access') ? 'policy-token' : 'session-token' },
                                { label: 'Primary response', value: 'JSON document with domain-specific envelope' }
                            ])}
                        `
                    },
                    {
                        kicker: 'Consumers',
                        title: 'Features, Requirements, and Screens',
                        body: renderLinks([...features, ...requirements, ...screens], 'No consuming features, requirements, or screens are connected.')
                    },
                    {
                        kicker: 'Execution',
                        title: 'Backed Services and Test Coverage',
                        body: renderLinks([...services, ...testCases, ...defects], 'No downstream services, tests, or defects are connected.')
                    }
                ];
            case 'Service':
                return [
                    {
                        kicker: 'Service Catalog',
                        title: 'Mock Service Profile',
                        body: `<p class="relationship-entity-copy">${escapeHtml(summaryText || 'This fictional service owns a bounded part of the operational graph runtime.')}</p>${baseOverview}`
                    },
                    {
                        kicker: 'Upstream Context',
                        title: 'Connected APIs and Requirements',
                        body: renderLinks([...apis, ...requirements, ...features], 'No upstream APIs or requirements are connected.')
                    },
                    {
                        kicker: 'Operational Signals',
                        title: 'Tests, Defects, and Deployments',
                        body: renderLinks([...testCases, ...defects, ...deployments], 'No operational quality signals are connected.')
                    }
                ];
            case 'TestCase':
                return [
                    {
                        kicker: 'Quality Record',
                        title: 'Test Case Overview',
                        body: `<p class="relationship-entity-copy">${escapeHtml(summaryText || 'This fictional test case validates a specific slice of operational context.')}</p>${baseOverview}`
                    },
                    {
                        kicker: 'Coverage',
                        title: 'Validated Records',
                        body: renderLinks([...requirements, ...screens, ...apis, ...features], 'No validated business or technical records are connected.')
                    },
                    {
                        kicker: 'Execution Signals',
                        title: 'Suites and Failure Context',
                        body: renderLinks([...testSuites, ...defects, ...deployments], 'No suites, defects, or deployments are connected.')
                    }
                ];
            case 'TestSuite':
                return [
                    {
                        kicker: 'Suite Overview',
                        title: 'Regression Bundle',
                        body: `<p class="relationship-entity-copy">${escapeHtml(summaryText || 'This fictional test suite bundles multiple validation paths for a release-relevant area.')}</p>${baseOverview}`
                    },
                    {
                        kicker: 'Contained Validation',
                        title: 'Test Cases and Coverage',
                        body: renderLinks([...testCases, ...requirements, ...features], 'No contained test cases or requirements are connected.')
                    },
                    {
                        kicker: 'Signal Consumers',
                        title: 'Defects, Deployments, and AI',
                        body: renderLinks([...defects, ...deployments, ...aiCapabilities], 'No downstream quality consumers are connected.')
                    }
                ];
            case 'Defect':
                return [
                    {
                        kicker: 'Incident Ticket',
                        title: 'Defect Summary',
                        body: `<p class="relationship-entity-copy">${escapeHtml(summaryText || 'This fictional defect captures a delivery issue affecting operational behavior.')}</p>${baseOverview}`
                    },
                    {
                        kicker: 'Blast Radius',
                        title: 'Related Requirements and Failing Tests',
                        body: renderLinks([...requirements, ...testCases, ...features], 'No related requirements, tests, or features are connected.')
                    },
                    {
                        kicker: 'Triage',
                        title: 'RCA and Deployment Context',
                        body: renderLinks([...rcas, ...deployments, ...aiCapabilities], 'No RCA, deployment, or AI triage records are connected.')
                    }
                ];
            case 'RCA':
                return [
                    {
                        kicker: 'Root Cause Note',
                        title: 'Finding Summary',
                        body: `<p class="relationship-entity-copy">${escapeHtml(summaryText || 'This fictional RCA documents the most likely technical explanation for the linked issue.')}</p>${baseOverview}`
                    },
                    {
                        kicker: 'Explains',
                        title: 'Defect and Requirement Trail',
                        body: renderLinks([...defects, ...requirements, ...services], 'No defects, requirements, or services are connected.')
                    },
                    {
                        kicker: 'Operational Follow-up',
                        title: 'Deployments and AI Context',
                        body: renderLinks([...deployments, ...aiCapabilities], 'No deployment or AI-related records are connected.')
                    }
                ];
            case 'Deployment':
                return [
                    {
                        kicker: 'Release Center',
                        title: 'Mock Deployment Record',
                        body: `<p class="relationship-entity-copy">${escapeHtml(summaryText || 'This fictional deployment record summarizes a release event and its nearby operational context.')}</p>${baseOverview}`
                    },
                    {
                        kicker: 'Change Scope',
                        title: 'Included or Related Context',
                        body: renderLinks([...features, ...requirements, ...services], 'No feature, requirement, or service scope is connected.')
                    },
                    {
                        kicker: 'Incident Review',
                        title: 'Defects, RCA, and AI Triage',
                        body: renderLinks([...defects, ...rcas, ...aiCapabilities], 'No defects, RCA findings, or AI triage records are connected.')
                    }
                ];
            case 'Region':
                return [
                    {
                        kicker: 'Rollout Matrix',
                        title: 'Regional Context',
                        body: `<p class="relationship-entity-copy">${escapeHtml(summaryText || 'This fictional region record tracks where product capabilities are available and monitored.')}</p>${baseOverview}`
                    },
                    {
                        kicker: 'Coverage',
                        title: 'Products and Languages',
                        body: renderLinks([...products, ...languages], 'No products or languages are connected.')
                    }
                ];
            case 'Language':
                return [
                    {
                        kicker: 'Localization Record',
                        title: 'Language Coverage',
                        body: `<p class="relationship-entity-copy">${escapeHtml(summaryText || 'This fictional language record shows where localized support is expected across the system.')}</p>${baseOverview}`
                    },
                    {
                        kicker: 'Availability',
                        title: 'Products and Regions',
                        body: renderLinks([...products, ...regions], 'No products or rollout regions are connected.')
                    }
                ];
            case 'AICapability':
                return [
                    {
                        kicker: 'AI Capability Registry',
                        title: 'Assistant Mission',
                        body: `<p class="relationship-entity-copy">${escapeHtml(summaryText || 'This fictional AI capability consumes structured operational context to assist engineering and QA workflows.')}</p>${baseOverview}`
                    },
                    {
                        kicker: 'Context Model',
                        title: 'Referenced Node Classes',
                        body: renderLinks([...nodeClasses, ...requirements, ...defects, ...deployments], 'No context model references are connected.')
                    },
                    {
                        kicker: 'Concrete Examples',
                        title: 'Related Operational Records',
                        body: renderLinks([...features, ...rcas, ...testCases], 'No concrete operational examples are connected.')
                    }
                ];
            case 'NodeClassReference':
                return [
                    {
                        kicker: 'Reference Class',
                        title: 'Conceptual Node Type',
                        body: `<p class="relationship-entity-copy">${escapeHtml(summaryText || 'This conceptual record exists so AI capability nodes can reference entire classes of graph entities.')}</p>${baseOverview}`
                    },
                    {
                        kicker: 'Referenced By',
                        title: 'Connected AI Capabilities',
                        body: renderLinks(aiCapabilities, 'No AI capabilities are connected to this node class.')
                    }
                ];
            default:
                return defaultSections;
        }
    }

    function buildSidebarSections(node, selectedState) {
        const groupedCards = selectedState.relationGroups.length > 0
            ? selectedState.relationGroups.map(group => `
                <article class="relationship-entity-sidebar-card">
                    <h3 class="relationship-entity-sidebar-card__title">${escapeHtml(group.title)}</h3>
                    <p class="relationship-entity-sidebar-card__meta">${group.items.length} linked record${group.items.length === 1 ? '' : 's'}</p>
                    ${renderLinks(group.items, 'No connected records.')}
                </article>
            `).join('')
            : '<p class="relationship-entity-empty">No grouped relationships are connected to this entity.</p>';

        return `
            <section class="relationship-entity-section">
                <p class="relationship-graph-kicker">Record Navigation</p>
                <h2 class="relationship-entity-section__title">Grouped Relationships</h2>
                <div class="relationship-entity-sidebar-stack">${groupedCards}</div>
            </section>
        `;
    }

    function populateSummary(node, selectedState, root) {
        root.querySelector('[data-entity-title]').textContent = node.label;
        root.querySelector('[data-entity-summary]').textContent = node.summary || node.description || 'No summary provided for this fictional record.';
        root.querySelector('[data-entity-type]').textContent = node.displayType;
        root.querySelector('[data-entity-direct-links]').textContent = String(selectedState.connectedCount);
        root.querySelector('[data-entity-group-count]').textContent = String(selectedState.relationGroupCount);
        root.querySelector('[data-entity-edge-count]').textContent = String(node.connectionCount);
        document.title = `${node.label} | Operational Context Record | Douglas D'Avila`;
    }

    async function mount() {
        const root = document.getElementById('relationship-entity-root');
        if (!root) return;

        const entityId = getEntityIdFromUrl();
        const openInGraphButton = root.querySelector('#relationship-entity-open-graph-focus');
        if (openInGraphButton) {
            openInGraphButton.addEventListener('click', () => {
                if (entityId) {
                    global.sessionStorage?.setItem?.(GRAPH_FOCUS_STORAGE_KEY, entityId);
                }
                window.location.href = buildGraphHref(entityId);
            }, { once: true });
        }

        if (!entityId) {
            root.querySelector('#relationship-entity-main').innerHTML = `
                <div class="relationship-entity-placeholder">
                    <p class="relationship-graph-kicker">Missing entity</p>
                    <h2 class="relationship-entity-section__title">No record was requested</h2>
                    <p class="mb-0 text-body-secondary">Open an entity from the Operational Context Graph details panel to view its mock system page.</p>
                </div>
            `;
            return;
        }

        try {
            const rawDataset = await graphLoader.loadOperationalGraphDataset();
            const dataset = graphAdapter.mapOperationalContextDataset(rawDataset);
            dataset.nodeById = new Map(dataset.nodes.map(node => [node.id, node]));
            const selectedState = graphDetails.buildSelectedNodeState(entityId, dataset);

            if (!selectedState?.node) {
                throw new Error(`Entity "${entityId}" was not found in the current dataset.`);
            }

            const node = selectedState.node;
            populateSummary(node, selectedState, root);
            root.querySelector('#relationship-entity-main').innerHTML = buildRecordSections(node, selectedState)
                .map(renderSection)
                .join('');
            root.querySelector('#relationship-entity-sidebar').innerHTML = buildSidebarSections(node, selectedState);
        } catch (error) {
            root.querySelector('#relationship-entity-main').innerHTML = `
                <div class="relationship-entity-placeholder">
                    <p class="relationship-graph-kicker">Error</p>
                    <h2 class="relationship-entity-section__title">Unable to load entity record</h2>
                    <p class="mb-0 text-body-secondary">${escapeHtml(String(error?.message || 'Unexpected entity page error.'))}</p>
                </div>
            `;
        }
    }

    function unmount() {}

    global.RelationshipEntityPageFeature = {
        mount,
        unmount
    };
})(window);
