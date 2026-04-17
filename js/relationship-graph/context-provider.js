(function initializeGraphContextProvider(global) {
    'use strict';

    const traversalUtils = global.GraphTraversalUtils;

    class GraphContextProvider {
        constructor(graphController) {
            this.graphController = graphController;
        }

        buildQueryContext(userQuestion, conversationHistory) {
            const dataset = this.graphController.getDatasetContext();
            const currentView = this.graphController.getStateSnapshot();
            const selectedNodeId = currentView.selectedNodeId;
            const candidateNodes = traversalUtils.findCandidateNodes(dataset, userQuestion, 6);
            const seedNodeIds = new Set(candidateNodes.map(node => node.id));

            if (selectedNodeId) {
                seedNodeIds.add(selectedNodeId);
            }

            const expandedNeighborhoods = [...seedNodeIds]
                .slice(0, 4)
                .map(seedNodeId => {
                    const neighborhood = traversalUtils.collectNeighborhood(dataset, [seedNodeId], 2);
                    return {
                        seedNodeId,
                        depth: neighborhood.depth,
                        nodes: neighborhood.nodeIds
                            .map(nodeId => dataset.nodeById.get(nodeId))
                            .filter(Boolean)
                            .map(node => ({
                                id: node.id,
                                label: node.label,
                                type: node.type,
                                summary: node.summary || node.description || ''
                            })),
                        links: neighborhood.edgeIds
                            .map(edgeId => dataset.edgeById.get(edgeId))
                            .filter(Boolean)
                            .map(link => ({
                                source: link.source.id || link.source,
                                target: link.target.id || link.target,
                                type: link.type,
                                label: link.label
                            }))
                    };
                });

            return {
                graphMeta: dataset.meta,
                schema: {
                    nodeTypes: dataset.nodeTypes,
                    relationshipTypes: dataset.edgeTypes
                },
                currentView: {
                    selectedNodeId: currentView.selectedNodeId,
                    manualFilterType: currentView.manualFilterType,
                    assistantFilterTypes: currentView.assistantFilterTypes,
                    showLabels: currentView.showLabels
                },
                candidateNodes: candidateNodes.map(node => ({
                    id: node.id,
                    label: node.label,
                    type: node.type,
                    summary: node.summary || node.description || '',
                    connectionCount: node.connectionCount
                })),
                expandedNeighborhoods,
                nodes: dataset.nodes.map(node => ({
                    id: node.id,
                    label: node.label,
                    type: node.type,
                    displayType: node.displayType,
                    summary: node.summary || node.description || '',
                    attributes: node.attributes,
                    connectionCount: node.connectionCount
                })),
                links: dataset.links.map(link => ({
                    id: link.id,
                    source: link.source.id || link.source,
                    target: link.target.id || link.target,
                    type: link.type,
                    label: link.label,
                    inverseLabel: link.inverseLabel || null
                })),
                history: conversationHistory.slice(-8).map(message => ({
                    role: message.role,
                    text: message.text
                }))
            };
        }
    }

    global.GraphContextProvider = GraphContextProvider;
})(window);
