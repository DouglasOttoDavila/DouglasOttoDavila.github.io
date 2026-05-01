(function initializeRelationshipGraphFeature(global) {
    'use strict';

    const d3 = global.d3;
    const graphConfig = global.RelationshipGraphConfig;
    const graphLoader = global.RelationshipGraphDataLoader;
    const graphAdapter = global.RelationshipGraphAdapter;
    const graphDetails = global.RelationshipGraphDetails;
    const GraphContextProvider = global.GraphContextProvider;
    const GraphPromptBuilder = global.GraphPromptBuilder;
    const GraphAssistantService = global.GraphAssistantService;
    const GraphActionInterpreter = global.GraphActionInterpreter;
    const GraphChatPanel = global.GraphChatPanel;
    const GRAPH_FOCUS_STORAGE_KEY = 'relationship_graph_focus_node';

    function formatHsl(accent) {
        return `hsl(${accent})`;
    }

    function createId() {
        return global.crypto?.randomUUID?.() || `graph-id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function getGraphEntityIdFromUrl() {
        const fromStorage = global.sessionStorage?.getItem?.(GRAPH_FOCUS_STORAGE_KEY);
        if (fromStorage) return fromStorage;

        const hash = String(global.location.hash || '').replace(/^#/, '');
        const queryIndex = hash.indexOf('?');
        if (queryIndex !== -1) {
            const routeId = hash.slice(0, queryIndex);
            if (routeId === 'relationship-graph') {
                const fromHash = new URLSearchParams(hash.slice(queryIndex + 1)).get('entity');
                if (fromHash) return fromHash;
            }
        }

        return new URLSearchParams(global.location.search).get('entity') || '';
    }

    class OperationalContextGraphApp {
        constructor(root, dataset, options = {}) {
            this.root = root;
            this.dataset = dataset;
            this.assistantAccess = normalizeAssistantAccess(options.assistantAccess || options);
            this.nodes = dataset.nodes.map(node => ({ ...node }));
            this.links = dataset.links.map(link => ({ ...link }));
            this.nodeById = new Map(this.nodes.map(node => [node.id, node]));
            this.edgeById = new Map(this.links.map(link => [link.id, link]));
            this.datasetContext = {
                ...dataset,
                nodes: this.nodes,
                links: this.links,
                nodeById: this.nodeById,
                edgeById: this.edgeById
            };

            this.neighborIdsByNode = new Map();
            this.edgeIdsByNode = new Map();
            this.selectedNodeId = null;
            this.hoveredNodeId = null;
            this.query = '';
            this.filterValue = 'all';
            this.showLabels = false;
            this.assistantHighlightedNodeIds = new Set();
            this.assistantHighlightedEdgeIds = new Set();
            this.assistantNodeTypeFilter = null;
            this.chatPanel = null;
            this.abortController = new AbortController();
            this.initialEntityId = getGraphEntityIdFromUrl();
            this.initialSelectionApplied = false;
            this.isPanelMinimized = false;
            this.isAssistantMinimized = false;

            this.canvasEl = root.querySelector('#relationship-graph-canvas');
            this.panelEl = root.querySelector('#relationship-graph-panel');
            this.tooltipEl = root.querySelector('#relationship-graph-tooltip');
            this.searchEl = root.querySelector('#relationship-graph-search');
            this.filterEl = root.querySelector('#relationship-graph-filter');
            this.resetEl = root.querySelector('#relationship-graph-reset');
            this.clearSelectionEl = root.querySelector('#relationship-graph-clear-selection');
            this.fitEl = root.querySelector('#relationship-graph-fit');
            this.layoutToggleEl = root.querySelector('#relationship-graph-layout-toggle');
            this.layoutToggleTextEl = root.querySelector('[data-layout-toggle-text]');
            this.labelsToggleEl = root.querySelector('#relationship-graph-labels-toggle');
            this.labelsToggleTextEl = root.querySelector('[data-label-toggle-text]');
            this.resultsEl = root.querySelector('#relationship-graph-search-results');
            this.legendEl = root.querySelector('#relationship-graph-legend');
            this.assistantRootEl = root.querySelector('#relationship-graph-assistant');
            this.assistantSlotEl = root.querySelector('#relationship-graph-assistant-slot');
            this.assistantCanvasSlotEl = root.querySelector('#relationship-graph-assistant-canvas-slot');
            this.assistantLockEl = root.querySelector('#relationship-graph-assistant-lock-message');

            this.buildIndexes();
            this.populateSummary();
            this.populateFilterOptions();
            this.populateLegend();
            this.initializeGraph();
            this.bindUI();
            this.initializeAssistant();
            this.applyAssistantAccess(this.assistantAccess);
            this.ensureAssistantMinimizeControl();
            this.updateLabelsToggleText();
            this.updateLayoutToggleText();
            this.syncAssistantPlacement();
            this.updateSearchResults();
            this.renderPanel(null);
        }

        buildIndexes() {
            this.nodes.forEach(node => {
                this.neighborIdsByNode.set(node.id, new Set([node.id]));
                this.edgeIdsByNode.set(node.id, new Set());
            });

            this.links.forEach(link => {
                const sourceId = link.source.id || link.source;
                const targetId = link.target.id || link.target;
                this.neighborIdsByNode.get(sourceId)?.add(targetId);
                this.neighborIdsByNode.get(targetId)?.add(sourceId);
                this.edgeIdsByNode.get(sourceId)?.add(link.id);
                this.edgeIdsByNode.get(targetId)?.add(link.id);
            });
        }

        populateSummary() {
            this.root.querySelector('[data-summary-nodes]').textContent = String(this.dataset.meta.nodeCount || this.dataset.meta.displayNodeCount || this.nodes.length);
            this.root.querySelector('[data-summary-links]').textContent = String(this.dataset.meta.linkCount || this.dataset.meta.displayLinkCount || this.links.length);
            this.root.querySelector('[data-summary-types]').textContent = String(this.dataset.meta.nodeTypeCount || this.dataset.nodeTypes.length);
            this.root.querySelector('[data-summary-ai]').textContent = String(this.dataset.meta.aiCapabilityCount || 0);
        }

        populateFilterOptions() {
            if (!this.filterEl) return;
            const typeOptions = [...this.dataset.nodeTypes]
                .sort((left, right) => graphConfig.getNodeTypeConfig(left).order - graphConfig.getNodeTypeConfig(right).order);

            this.filterEl.innerHTML = [
                '<option value="all">All nodes</option>',
                ...typeOptions.map(type => `<option value="${type}">${graphConfig.getNodeTypeConfig(type).displayLabel}</option>`)
            ].join('');
        }

        populateLegend() {
            if (!this.legendEl) return;
            const legendItems = [...this.dataset.nodeTypes]
                .sort((left, right) => graphConfig.getNodeTypeConfig(left).order - graphConfig.getNodeTypeConfig(right).order)
                .map(type => {
                    const config = graphConfig.getNodeTypeConfig(type);
                    return `
                        <span class="relationship-graph-legend__item">
                            <span class="relationship-graph-legend__swatch" style="--legend-accent: ${formatHsl(config.accent)}"></span>
                            <span>${config.displayLabel}</span>
                        </span>
                    `;
                })
                .join('');

            this.legendEl.innerHTML = legendItems;
        }

        initializeGraph() {
            if (!d3 || !this.canvasEl || !this.panelEl) {
                this.panelEl.innerHTML = `
                    <div class="relationship-graph-panel__inner">
                        <p class="relationship-graph-kicker">Unavailable</p>
                        <h2 class="relationship-graph-panel__title">D3 failed to load</h2>
                        <p class="relationship-graph-panel__text">The graph runtime depends on D3. Check the vendor script and refresh the page.</p>
                    </div>
                `;
                return;
            }

            this.width = Math.max(this.canvasEl.clientWidth, 320);
            this.height = Math.max(this.canvasEl.clientHeight, 520);

            this.svg = d3.select(this.canvasEl)
                .append('svg')
                .attr('class', 'relationship-graph-svg')
                .attr('viewBox', `0 0 ${this.width} ${this.height}`)
                .attr('aria-hidden', 'true');

            this.svg.append('rect')
                .attr('class', 'relationship-graph-hitbox')
                .attr('width', this.width)
                .attr('height', this.height)
                .attr('fill', 'transparent');

            this.zoomLayer = this.svg.append('g').attr('class', 'relationship-graph-zoom-layer');
            this.linkLayer = this.zoomLayer.append('g').attr('class', 'relationship-graph-links');
            this.nodeLayer = this.zoomLayer.append('g').attr('class', 'relationship-graph-nodes');

            this.zoomBehavior = d3.zoom()
                .scaleExtent([0.36, 2.9])
                .on('zoom', event => {
                    this.zoomLayer.attr('transform', event.transform);
                });

            this.svg.call(this.zoomBehavior);

            this.linkSelection = this.linkLayer
                .selectAll('path')
                .data(this.links, link => link.id)
                .join('path')
                .attr('class', link => `relationship-graph-link relationship-graph-link--${link.family}`)
                .style('--link-accent', link => formatHsl(link.accent))
                .style('--link-width', link => `${link.width}px`)
                .style('--link-dasharray', link => link.dasharray || 'none');

            this.nodeSelection = this.nodeLayer
                .selectAll('g')
                .data(this.nodes, node => node.id)
                .join(enter => {
                    const group = enter.append('g')
                        .attr('class', node => `relationship-graph-node relationship-graph-node--${node.type}`)
                        .attr('tabindex', 0)
                        .attr('role', 'button')
                        .attr('aria-label', node => `${node.label}, ${node.displayType}`)
                        .style('--node-accent', node => formatHsl(node.accent));

                    group.append('circle')
                        .attr('class', 'relationship-graph-node__halo')
                        .attr('r', node => this.getNodeRadius(node) + 10);

                    group.append('path')
                        .attr('class', 'relationship-graph-node__shape')
                        .attr('d', node => this.getNodeSymbolPath(node));

                    group.append('text')
                        .attr('class', 'relationship-graph-node__label')
                        .attr('text-anchor', 'middle')
                        .attr('x', 0)
                        .attr('y', node => this.getNodeRadius(node) + 18)
                        .text(node => node.label);

                    return group;
                });

            this.nodeSelection
                .call(
                    d3.drag()
                        .on('start', (event, node) => this.handleDragStart(event, node))
                        .on('drag', (event, node) => this.handleDrag(event, node))
                        .on('end', (event, node) => this.handleDragEnd(event, node))
                )
                .on('click', (event, node) => {
                    event.stopPropagation();
                    this.selectNode(node.id, true, 'user');
                })
                .on('mouseenter', (event, node) => {
                    this.hoveredNodeId = node.id;
                    this.showTooltip(event, node);
                    this.updateVisualState();
                })
                .on('mousemove', event => this.moveTooltip(event))
                .on('mouseleave', () => {
                    this.hoveredNodeId = null;
                    this.hideTooltip();
                    this.updateVisualState();
                })
                .on('keydown', (event, node) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        this.selectNode(node.id, true, 'user');
                    }
                });

            this.svg.on('click', () => {
                this.clearSelection('user');
            });

            this.simulation = d3.forceSimulation(this.nodes)
                .force('link', d3.forceLink(this.links)
                    .id(node => node.id)
                    .distance(link => this.getLinkDistance(link))
                    .strength(link => this.getLinkStrength(link)))
                .force('charge', d3.forceManyBody().strength(node => this.getChargeStrength(node)))
                .force('collide', d3.forceCollide().radius(node => this.getNodeRadius(node) + 16))
                .force('center', d3.forceCenter(this.width / 2, this.height / 2))
                .force('x', d3.forceX(node => this.width * node.cluster.x).strength(0.1))
                .force('y', d3.forceY(node => this.height * node.cluster.y).strength(0.1))
                .alphaDecay(0.03)
                .velocityDecay(0.25)
                .on('tick', () => this.ticked());

            if (typeof ResizeObserver === 'function') {
                this.resizeObserver = new ResizeObserver(() => this.handleResize());
                this.resizeObserver.observe(this.canvasEl);
            }

            global.setTimeout(() => this.fitToViewport(false), 220);
            this.scheduleInitialSelection();
            this.updateVisualState();
        }

        initializeAssistant() {
            if (!this.assistantRootEl) return;

            this.chatPanel = new GraphChatPanel({
                root: this.root,
                graphController: this,
                contextProvider: new GraphContextProvider(this),
                promptBuilder: GraphPromptBuilder,
                assistantService: new GraphAssistantService({
                    getAccessToken: () => this.assistantAccess.getAccessToken?.()
                }),
                actionInterpreter: new GraphActionInterpreter(this)
            });
        }

        applyAssistantAccess(access) {
            this.assistantAccess = normalizeAssistantAccess(access);
            if (!this.assistantRootEl) return;

            const isLocked = !this.assistantAccess.canUseAssistant;
            this.assistantRootEl.classList.toggle('is-locked', isLocked);
            this.assistantRootEl.setAttribute('aria-disabled', String(isLocked));

            [this.assistantRootEl.querySelector('#relationship-graph-chat-clear'),
                this.assistantRootEl.querySelector('#relationship-graph-chat-input'),
                this.assistantRootEl.querySelector('#relationship-graph-chat-submit')]
                .filter(Boolean)
                .forEach(control => {
                    control.disabled = isLocked;
                    control.setAttribute('aria-disabled', String(isLocked));
                    control.tabIndex = isLocked ? -1 : 0;
                });

            if (this.assistantLockEl) {
                const titleEl = this.assistantLockEl.querySelector('strong');
                const detailEl = this.assistantLockEl.querySelector('span');
                const actionEl = this.assistantLockEl.querySelector('a[data-route="login"]');
                if (titleEl) titleEl.textContent = this.assistantAccess.lockedMessage;
                if (detailEl) detailEl.textContent = this.assistantAccess.lockedDetail;
                if (actionEl) actionEl.classList.toggle('d-none', Boolean(this.assistantAccess.isAuthenticated));
            }
        }

        bindUI() {
            const signal = this.abortController.signal;

            this.searchEl?.addEventListener('input', event => {
                this.query = String(event.target.value || '').trim().toLowerCase();
                this.updateSearchResults();
                this.updateVisualState();
            }, { signal });

            this.searchEl?.addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    const matches = this.getVisibleMatches();
                    if (matches.length > 0) {
                        this.selectNode(matches[0].id, true, 'user');
                    }
                }
            }, { signal });

            this.filterEl?.addEventListener('change', event => {
                this.filterValue = String(event.target.value || 'all');
                this.updateSearchResults();
                this.updateVisualState();
            }, { signal });

            this.resultsEl?.addEventListener('click', event => {
                const pill = event.target.closest('[data-node-id]');
                if (!pill) return;
                this.selectNode(pill.getAttribute('data-node-id'), true, 'user');
            }, { signal });

            this.labelsToggleEl?.addEventListener('click', () => {
                this.showLabels = !this.showLabels;
                this.updateLabelsToggleText();
                this.updateVisualState();
            }, { signal });

            this.fitEl?.addEventListener('click', () => {
                const highlightedNodeIds = this.getHighlightedNodeIds();
                if (highlightedNodeIds.length > 0) {
                    this.fitNodeIds(highlightedNodeIds);
                } else {
                    this.fitToViewport(true);
                }
            }, { signal });

            this.layoutToggleEl?.addEventListener('click', () => {
                this.toggleCanvasLayout();
            }, { signal });

            this.clearSelectionEl?.addEventListener('click', () => {
                this.clearSelection('user');
            }, { signal });

            this.resetEl?.addEventListener('click', () => {
                this.resetGraphState('user');
            }, { signal });

            global.addEventListener('resize', () => {
                this.syncAssistantPlacement();
            }, { signal });
        }

        updateLabelsToggleText() {
            if (!this.labelsToggleTextEl) return;
            this.labelsToggleTextEl.textContent = this.showLabels ? 'Labels On' : 'Labels Off';
        }

        updateLayoutToggleText() {
            const isExpanded = this.root.classList.contains('is-graph-expanded');
            if (this.layoutToggleTextEl) {
                this.layoutToggleTextEl.textContent = isExpanded ? 'Standard layout' : 'Wide canvas';
            }
            if (this.layoutToggleEl) {
                this.layoutToggleEl.setAttribute('aria-pressed', String(isExpanded));
            }
        }

        syncAssistantPlacement() {
            if (!this.assistantRootEl || !this.assistantSlotEl || !this.assistantCanvasSlotEl) return;

            const isExpanded = this.root.classList.contains('is-graph-expanded');
            const canOverlayInCanvas = global.matchMedia?.('(min-width: 1100px)')?.matches ?? true;
            const shouldUseCanvasOverlay = isExpanded && canOverlayInCanvas;
            const targetContainer = shouldUseCanvasOverlay ? this.assistantCanvasSlotEl : this.assistantSlotEl;

            if (this.assistantRootEl.parentElement !== targetContainer) {
                targetContainer.appendChild(this.assistantRootEl);
            }

            this.assistantRootEl.classList.toggle('relationship-graph-assistant--overlay', shouldUseCanvasOverlay);
        }

        toggleCanvasLayout() {
            this.root.classList.toggle('is-graph-expanded');
            this.updateLayoutToggleText();
            this.syncAssistantPlacement();
            this.ensureAssistantMinimizeControl();

            global.requestAnimationFrame(() => {
                this.handleResize();
                global.setTimeout(() => {
                    const highlightedNodeIds = this.getHighlightedNodeIds();
                    if (highlightedNodeIds.length > 0) {
                        this.fitNodeIds(highlightedNodeIds);
                    } else {
                        this.fitToViewport(true);
                    }
                }, 90);
            });
        }

        matchesManualFilter(node) {
            if (this.filterValue === 'all') return true;
            return node.type === this.filterValue;
        }

        matchesAssistantTypeFilter(node) {
            if (!this.assistantNodeTypeFilter || this.assistantNodeTypeFilter.size === 0) return true;
            return this.assistantNodeTypeFilter.has(node.type);
        }

        getVisibleMatches() {
            return this.nodes
                .filter(node => this.matchesAssistantTypeFilter(node))
                .filter(node => this.matchesManualFilter(node))
                .filter(node => {
                    if (!this.query) return true;
                    const haystack = [node.label, node.displayType, node.summary, node.description]
                        .filter(Boolean)
                        .join(' ')
                        .toLowerCase();
                    return haystack.includes(this.query);
                });
        }

        updateSearchResults() {
            if (!this.resultsEl) return;

            const matches = this.getVisibleMatches();
            const hasAssistantFilter = Boolean(this.assistantNodeTypeFilter && this.assistantNodeTypeFilter.size > 0);

            if (!this.query && this.filterValue === 'all' && !hasAssistantFilter) {
                this.resultsEl.innerHTML = `
                    <span class="relationship-graph-search-results__hint">
                        Explore a requirement into validating tests, inspect a defect into RCA and deployment history, or ask the assistant to focus a relevant operational cluster.
                    </span>
                `;
                return;
            }

            if (matches.length === 0) {
                this.resultsEl.innerHTML = '<span class="relationship-graph-search-results__hint">No nodes match the current search/filter.</span>';
                return;
            }

            const preview = matches.slice(0, 10).map(node => `
                <button class="relationship-graph-search-results__pill" type="button" data-node-id="${node.id}">
                    <span class="relationship-graph-search-results__pill-type">${node.displayType}</span>
                    <span>${node.label}</span>
                </button>
            `).join('');

            const suffix = matches.length > 10 ? `<span class="relationship-graph-search-results__hint">Showing 10 of ${matches.length} matching nodes.</span>` : '';
            this.resultsEl.innerHTML = preview + suffix;
        }

        renderPanel(nodeId) {
            if (!this.panelEl) return;
            this.panelEl.innerHTML = nodeId
                ? graphDetails.renderSelectedNodePanel(graphDetails.buildSelectedNodeState(nodeId, this.datasetContext))
                : graphDetails.renderEmptyPanel(this.datasetContext);

            this.panelEl.classList.toggle('is-minimized', this.isPanelMinimized);
            this.ensurePanelMinimizeControl();

            this.panelEl.querySelector('[data-inline-reset]')?.addEventListener('click', () => this.clearSelection('user'), { once: true });
        }

        ensurePanelMinimizeControl() {
            if (!this.panelEl) return;

            let button = this.panelEl.querySelector('.relationship-graph-panel__minimize-btn');
            if (!button) {
                button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn btn-sm btn-outline-secondary relationship-graph-panel__minimize-btn';
                button.addEventListener('click', () => this.togglePanelMinimized());
                this.panelEl.appendChild(button);
            }

            const icon = this.isPanelMinimized ? 'fa-angles-right' : 'fa-angles-left';
            const label = this.isPanelMinimized ? 'Expand details' : 'Collapse details';
            button.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i>`;
            button.setAttribute('aria-label', label);
            button.setAttribute('title', label);
            button.setAttribute('aria-expanded', String(!this.isPanelMinimized));
        }

        ensureAssistantMinimizeControl() {
            if (!this.assistantRootEl) return;

            const isExpanded = this.root.classList.contains('is-graph-expanded');
            if (!isExpanded) {
                this.isAssistantMinimized = false;
                this.assistantRootEl.classList.remove('is-minimized');
                this.assistantRootEl.querySelector('.relationship-graph-assistant__minimize-btn')?.remove();
                return;
            }

            let button = this.assistantRootEl.querySelector('.relationship-graph-assistant__minimize-btn');
            if (!button) {
                button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn btn-sm btn-outline-secondary relationship-graph-assistant__minimize-btn';
                button.addEventListener('click', () => this.toggleAssistantMinimized());
                this.assistantRootEl.appendChild(button);
            }

            const icon = this.isAssistantMinimized ? 'fa-angles-left' : 'fa-angles-right';
            const label = this.isAssistantMinimized ? 'Expand assistant' : 'Collapse assistant';
            button.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i>`;
            button.setAttribute('aria-label', label);
            button.setAttribute('title', label);
            button.setAttribute('aria-expanded', String(!this.isAssistantMinimized));

            this.assistantRootEl.classList.toggle('is-minimized', this.isAssistantMinimized);
        }

        togglePanelMinimized() {
            this.isPanelMinimized = !this.isPanelMinimized;
            this.panelEl?.classList.toggle('is-minimized', this.isPanelMinimized);
            this.ensurePanelMinimizeControl();
        }

        toggleAssistantMinimized() {
            this.isAssistantMinimized = !this.isAssistantMinimized;
            this.ensureAssistantMinimizeControl();
        }

        selectNode(nodeId, shouldFocus, origin = 'user') {
            if (!this.nodeById.has(nodeId)) return;
            this.selectedNodeId = nodeId;
            if (origin === 'assistant') {
                this.highlightNodes([nodeId]);
            }
            this.renderPanel(nodeId);
            this.updateVisualState();
            if (shouldFocus) {
                this.focusNode(nodeId);
            }
        }

        clearSelection(_origin = 'user') {
            this.selectedNodeId = null;
            this.renderPanel(null);
            this.updateVisualState();
            this.hideTooltip();
        }

        focusNode(nodeId) {
            if (!this.svg || !this.zoomBehavior) return;
            const node = this.nodeById.get(nodeId);
            if (!node || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return;

            const scale = 1.2;
            const translateX = (this.width / 2) - (node.x * scale);
            const translateY = (this.height / 2) - (node.y * scale);

            this.svg.transition()
                .duration(520)
                .call(
                    this.zoomBehavior.transform,
                    d3.zoomIdentity.translate(translateX, translateY).scale(scale)
                );
        }

        fitToViewport(animate) {
            if (!this.svg || !this.zoomBehavior) return;
            const transition = animate ? this.svg.transition().duration(640) : this.svg;
            transition.call(this.zoomBehavior.transform, d3.zoomIdentity.translate(this.width * 0.06, this.height * 0.05).scale(0.88));
        }

        fitNodeIds(nodeIds) {
            if (!this.svg || !this.zoomBehavior) return;
            const nodes = nodeIds
                .map(nodeId => this.nodeById.get(nodeId))
                .filter(node => node && Number.isFinite(node.x) && Number.isFinite(node.y));
            if (nodes.length === 0) return;

            const minX = Math.min(...nodes.map(node => node.x));
            const maxX = Math.max(...nodes.map(node => node.x));
            const minY = Math.min(...nodes.map(node => node.y));
            const maxY = Math.max(...nodes.map(node => node.y));
            const boundsWidth = Math.max(120, maxX - minX);
            const boundsHeight = Math.max(120, maxY - minY);
            const scale = Math.max(0.55, Math.min(1.9, 0.84 / Math.max(boundsWidth / this.width, boundsHeight / this.height)));
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            const translateX = (this.width / 2) - (centerX * scale);
            const translateY = (this.height / 2) - (centerY * scale);

            this.svg.transition()
                .duration(620)
                .call(
                    this.zoomBehavior.transform,
                    d3.zoomIdentity.translate(translateX, translateY).scale(scale)
                );
        }

        resetAssistantState() {
            this.assistantHighlightedNodeIds.clear();
            this.assistantHighlightedEdgeIds.clear();
            this.assistantNodeTypeFilter = null;
            this.updateSearchResults();
            this.updateVisualState();
        }

        resetAssistantTransientState() {
            this.assistantNodeTypeFilter = null;
            this.updateSearchResults();
            this.updateVisualState();
        }

        highlightNodes(nodeIds) {
            nodeIds.forEach(nodeId => {
                if (this.nodeById.has(nodeId)) {
                    this.assistantHighlightedNodeIds.add(nodeId);
                }
            });
        }

        highlightEdges(edgeIds) {
            edgeIds.forEach(edgeId => {
                if (this.edgeById.has(edgeId)) {
                    this.assistantHighlightedEdgeIds.add(edgeId);
                }
            });
        }

        setAssistantNodeTypeFilter(nodeTypes) {
            this.assistantNodeTypeFilter = new Set(nodeTypes || []);
            this.updateSearchResults();
        }

        refreshVisualState() {
            this.updateVisualState();
        }

        resetGraphState(origin = 'user') {
            if (this.searchEl) {
                this.searchEl.value = '';
            }
            if (this.filterEl) {
                this.filterEl.value = 'all';
            }

            this.query = '';
            this.filterValue = 'all';
            this.showLabels = false;
            this.updateLabelsToggleText();
            this.resetAssistantTransientState();
            this.clearSelection(origin);
            this.updateSearchResults();
            this.fitToViewport(true);
        }

        applyInitialRouteSelection(attempt = 0, delayOverride = null) {
            if (!this.initialEntityId || this.initialSelectionApplied) return;
            if (!this.nodeById.has(this.initialEntityId)) {
                global.sessionStorage?.removeItem?.(GRAPH_FOCUS_STORAGE_KEY);
                this.initialSelectionApplied = true;
                return;
            }

            const node = this.nodeById.get(this.initialEntityId);
            const hasCoordinates = Number.isFinite(node?.x) && Number.isFinite(node?.y);

            if (!hasCoordinates && attempt < 10) {
                global.setTimeout(() => this.applyInitialRouteSelection(attempt + 1, delayOverride), 120);
                return;
            }

            const delay = typeof delayOverride === 'number'
                ? delayOverride
                : (attempt === 0 ? 260 : 0);
            global.setTimeout(() => {
                this.selectNode(this.initialEntityId, true, 'user');
                global.sessionStorage?.removeItem?.(GRAPH_FOCUS_STORAGE_KEY);
                this.initialSelectionApplied = true;
            }, delay);
        }

        scheduleInitialSelection(attempt = 0) {
            this.applyInitialRouteSelection(attempt);
        }

        getHighlightedNodeIds() {
            const nodeIds = new Set(this.assistantHighlightedNodeIds);
            if (this.selectedNodeId) {
                nodeIds.add(this.selectedNodeId);
            }
            return [...nodeIds];
        }

        getDatasetContext() {
            return this.datasetContext;
        }

        getStateSnapshot() {
            return {
                selectedNodeId: this.selectedNodeId,
                manualFilterType: this.filterValue,
                assistantFilterTypes: this.assistantNodeTypeFilter ? [...this.assistantNodeTypeFilter] : null,
                showLabels: this.showLabels
            };
        }

        getNodeById(nodeId) {
            return this.nodeById.get(nodeId) || null;
        }

        updateVisualState() {
            if (!this.nodeSelection || !this.linkSelection) return;

            const anchorNodeId = this.selectedNodeId || this.hoveredNodeId;
            const relatedNodeIds = anchorNodeId ? (this.neighborIdsByNode.get(anchorNodeId) || new Set()) : new Set();
            const relatedEdgeIds = anchorNodeId ? (this.edgeIdsByNode.get(anchorNodeId) || new Set()) : new Set();
            const visibleMatchIds = new Set(this.getVisibleMatches().map(node => node.id));
            const hasManualConstraint = Boolean(this.query) || this.filterValue !== 'all';
            const assistantNodeTypeFilter = this.assistantNodeTypeFilter;
            const hasAssistantFilter = Boolean(assistantNodeTypeFilter && assistantNodeTypeFilter.size > 0);

            this.nodeSelection
                .classed('is-selected', node => this.selectedNodeId === node.id)
                .classed('is-hovered', node => this.hoveredNodeId === node.id)
                .classed('is-connected', node => anchorNodeId ? relatedNodeIds.has(node.id) && anchorNodeId !== node.id : false)
                .classed('is-query-match', node => hasManualConstraint && visibleMatchIds.has(node.id))
                .classed('is-assistant-highlighted', node => this.assistantHighlightedNodeIds.has(node.id))
                .classed('is-label-visible', node => {
                    if (this.showLabels) return true;
                    if (this.selectedNodeId === node.id || this.hoveredNodeId === node.id) return true;
                    if (relatedNodeIds.has(node.id)) return true;
                    if (this.assistantHighlightedNodeIds.has(node.id)) return true;
                    if (hasManualConstraint && visibleMatchIds.has(node.id)) return true;
                    return false;
                })
                .classed('is-faded', node => {
                    if (anchorNodeId && !relatedNodeIds.has(node.id) && !this.assistantHighlightedNodeIds.has(node.id)) {
                        return true;
                    }
                    if (hasManualConstraint && !visibleMatchIds.has(node.id) && !this.assistantHighlightedNodeIds.has(node.id) && this.selectedNodeId !== node.id) {
                        return true;
                    }
                    if (hasAssistantFilter && !assistantNodeTypeFilter.has(node.type) && !this.assistantHighlightedNodeIds.has(node.id) && this.selectedNodeId !== node.id) {
                        return true;
                    }
                    return false;
                });

            this.linkSelection
                .classed('is-active', link => relatedEdgeIds.has(link.id) || this.assistantHighlightedEdgeIds.has(link.id))
                .classed('is-faded', link => {
                    const sourceId = link.source.id || link.source;
                    const targetId = link.target.id || link.target;
                    const touchesAssistantNode = this.assistantHighlightedNodeIds.has(sourceId) || this.assistantHighlightedNodeIds.has(targetId);
                    if (anchorNodeId && !relatedEdgeIds.has(link.id) && !this.assistantHighlightedEdgeIds.has(link.id) && !touchesAssistantNode) {
                        return true;
                    }
                    if (hasManualConstraint && !(visibleMatchIds.has(sourceId) || visibleMatchIds.has(targetId) || touchesAssistantNode || this.assistantHighlightedEdgeIds.has(link.id))) {
                        return true;
                    }
                    if (hasAssistantFilter) {
                        const sourceNode = this.nodeById.get(sourceId);
                        const targetNode = this.nodeById.get(targetId);
                        const typeVisible = assistantNodeTypeFilter.has(sourceNode?.type) || assistantNodeTypeFilter.has(targetNode?.type);
                        if (!typeVisible && !touchesAssistantNode && !this.assistantHighlightedEdgeIds.has(link.id)) {
                            return true;
                        }
                    }
                    return false;
                });
        }

        showTooltip(event, node) {
            if (!this.tooltipEl) return;
            const summary = node.summary || node.description || `${node.displayType} node`;
            this.tooltipEl.innerHTML = `
                <strong>${node.label}</strong>
                <span>${node.displayType}</span>
                <span>${summary}</span>
            `;
            this.tooltipEl.classList.add('is-visible');
            this.moveTooltip(event);
        }

        moveTooltip(event) {
            if (!this.tooltipEl || !this.tooltipEl.classList.contains('is-visible')) return;
            const hostEl = this.tooltipEl.offsetParent || this.canvasEl;
            const hostBounds = hostEl.getBoundingClientRect();
            const tooltipBounds = this.tooltipEl.getBoundingClientRect();
            const padding = 14;
            const x = event.clientX - hostBounds.left + 18;
            const y = event.clientY - hostBounds.top + 18;
            const maxX = Math.max(padding, hostBounds.width - tooltipBounds.width - padding);
            const maxY = Math.max(padding, hostBounds.height - tooltipBounds.height - padding);
            const nextX = Math.min(Math.max(padding, x), maxX);
            const nextY = Math.min(Math.max(padding, y), maxY);

            this.tooltipEl.style.transform = `translate(${nextX}px, ${nextY}px)`;
        }

        hideTooltip() {
            if (!this.tooltipEl) return;
            this.tooltipEl.classList.remove('is-visible');
        }

        getNodeSymbolPath(node) {
            return d3.symbol()
                .type(graphConfig.getNodeSymbolType(node.symbolKey, d3))
                .size(this.getNodeSymbolSize(node))();
        }

        getNodeSymbolSize(node) {
            const typeConfig = graphConfig.getNodeTypeConfig(node.type);
            return typeConfig.size + Math.min(node.connectionCount * 18, 240);
        }

        getNodeRadius(node) {
            return Math.max(10, Math.sqrt(this.getNodeSymbolSize(node) / Math.PI) * 0.62);
        }

        getLinkDistance(link) {
            switch (link.family) {
                case 'structure':
                    return 92;
                case 'implementation':
                    return 104;
                case 'quality':
                    return 108;
                case 'incident':
                    return 114;
                case 'intelligence':
                    return 126;
                case 'locale':
                    return 118;
                default:
                    return 110;
            }
        }

        getLinkStrength(link) {
            return Math.min(0.32, 0.12 + ((Number(link.weight) || 1) * 0.05));
        }

        getChargeStrength(node) {
            if (node.type === 'Product' || node.type === 'AICapability') return -430;
            if (node.isSynthetic) return -150;
            if (node.type === 'Requirement' || node.type === 'Defect') return -310;
            return -230;
        }

        getCurvature(edge) {
            const sourceId = edge.source.id || edge.source;
            const targetId = edge.target.id || edge.target;
            const edgeId = `${sourceId}-${targetId}-${edge.type}`;
            let hash = 0;
            for (let index = 0; index < edgeId.length; index += 1) {
                hash = ((hash << 5) - hash) + edgeId.charCodeAt(index);
                hash |= 0;
            }
            return (hash % 18) - 9;
        }

        ticked() {
            this.linkSelection.attr('d', edge => {
                const source = edge.source;
                const target = edge.target;
                const deltaX = target.x - source.x;
                const deltaY = target.y - source.y;
                const curvature = this.getCurvature(edge);
                const midX = (source.x + target.x) / 2 - (deltaY * curvature / 40);
                const midY = (source.y + target.y) / 2 + (deltaX * curvature / 40);
                return `M ${source.x} ${source.y} Q ${midX} ${midY} ${target.x} ${target.y}`;
            });

            this.nodeSelection.attr('transform', node => `translate(${node.x}, ${node.y})`);
        }

        handleDragStart(event, node) {
            if (!event.active) {
                this.simulation.alphaTarget(0.2).restart();
            }
            node.fx = node.x;
            node.fy = node.y;
        }

        handleDrag(event, node) {
            node.fx = event.x;
            node.fy = event.y;
        }

        handleDragEnd(event, node) {
            if (!event.active) {
                this.simulation.alphaTarget(0);
            }
            node.fx = null;
            node.fy = null;
        }

        handleResize() {
            if (!this.canvasEl || !this.svg || !this.simulation) return;
            this.width = Math.max(this.canvasEl.clientWidth, 320);
            this.height = Math.max(this.canvasEl.clientHeight, 520);
            this.svg.attr('viewBox', `0 0 ${this.width} ${this.height}`);
            this.svg.select('.relationship-graph-hitbox')
                .attr('width', this.width)
                .attr('height', this.height);

            this.simulation
                .force('center', d3.forceCenter(this.width / 2, this.height / 2))
                .force('x', d3.forceX(node => this.width * node.cluster.x).strength(0.1))
                .force('y', d3.forceY(node => this.height * node.cluster.y).strength(0.1));

            this.simulation.alpha(0.4).restart();
        }

        destroy() {
            this.abortController.abort();
            this.hideTooltip();
            this.resizeObserver?.disconnect();
            this.simulation?.stop();
            this.svg?.remove();
            this.chatPanel?.destroy?.();
            if (this.resultsEl) {
                this.resultsEl.innerHTML = '';
            }
            if (this.legendEl) {
                this.legendEl.innerHTML = '';
            }
        }
    }

    let currentApp = null;
    let mountSequence = 0;

    function renderLoadingState(root) {
        root.querySelector('#relationship-graph-panel').innerHTML = `
            <div class="relationship-graph-panel__inner">
                <p class="relationship-graph-kicker">Loading</p>
                <h2 class="relationship-graph-panel__title">Preparing operational graph</h2>
                <p class="relationship-graph-panel__text">Loading the fictional nodes-links dataset and initializing the graph canvas.</p>
            </div>
        `;
    }

    function renderErrorState(root, error) {
        root.querySelector('#relationship-graph-panel').innerHTML = `
            <div class="relationship-graph-panel__inner">
                <p class="relationship-graph-kicker">Error</p>
                <h2 class="relationship-graph-panel__title">Unable to load graph data</h2>
                <p class="relationship-graph-panel__text">${String(error?.message || 'Unexpected graph loading error.')}</p>
            </div>
        `;
    }

    function normalizeAssistantAccess(access = {}) {
        const canUseAssistant = Boolean(access.canUseAssistant);
        return {
            canUseAssistant,
            isAuthenticated: Boolean(access.isAuthenticated),
            lockedMessage: access.lockedMessage || 'Log In to Unlock this Feature',
            lockedDetail: access.lockedDetail || 'The graph remains available, but the AI assistant requires an approved account.',
            getAccessToken: typeof access.getAccessToken === 'function' ? access.getAccessToken : null
        };
    }

    async function mount(options = {}) {
        const root = document.getElementById('relationship-graph-root');
        if (!root) return;

        const sequence = ++mountSequence;
        renderLoadingState(root);

        try {
            const rawDataset = await graphLoader.loadOperationalGraphDataset();
            if (sequence !== mountSequence) return;

            const dataset = graphAdapter.mapOperationalContextDataset(rawDataset);
            if (currentApp) {
                currentApp.destroy();
            }

            currentApp = new OperationalContextGraphApp(root, dataset, options);
            if (currentApp.initialEntityId) {
                global.setTimeout(() => {
                    currentApp?.applyInitialRouteSelection?.(0, 380);
                }, 0);
            }
        } catch (error) {
            console.error('[relationship-graph] failed to initialize', error);
            renderErrorState(root, error);
        }
    }

    function unmount() {
        mountSequence += 1;
        if (!currentApp) return;
        currentApp.destroy();
        currentApp = null;
    }

    global.RelationshipGraphFeature = {
        mount,
        unmount,
        setAssistantAccess(access) {
            currentApp?.applyAssistantAccess?.(access);
        }
    };
})(window);
