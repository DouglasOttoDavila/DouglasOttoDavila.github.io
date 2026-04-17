(function initializeGraphActionInterpreter(global) {
    'use strict';

    const traversalUtils = global.GraphTraversalUtils;

    class GraphActionInterpreter {
        constructor(graphController) {
            this.graphController = graphController;
        }

        applyActions(actions) {
            const normalizedActions = Array.isArray(actions) ? actions : [];
            const applied = [];
            const ignored = [];
            const dataset = this.graphController.getDatasetContext();

            normalizedActions.forEach(action => {
                const result = this.applySingleAction(action, dataset);
                if (!result) return;
                if (result.applied) {
                    applied.push(result.message);
                } else {
                    ignored.push(result.message);
                }
            });

            this.graphController.refreshVisualState();

            return { applied, ignored };
        }

        applySingleAction(action, dataset) {
            if (!action || typeof action.type !== 'string') {
                return { applied: false, message: 'Ignored malformed action.' };
            }

            switch (action.type) {
                case 'resetGraphState':
                    this.graphController.resetGraphState('assistant');
                    return { applied: true, message: 'Reset graph selection, highlights, filters, and viewport.' };

                case 'selectNode':
                    if (!dataset.nodeById.has(action.nodeId)) {
                        return { applied: false, message: `Ignored unknown node ID "${action.nodeId}".` };
                    }
                    this.graphController.selectNode(action.nodeId, false, 'assistant');
                    return { applied: true, message: `Selected ${dataset.nodeById.get(action.nodeId).label}.` };

                case 'focusNode':
                    if (!dataset.nodeById.has(action.nodeId)) {
                        return { applied: false, message: `Ignored unknown focus node "${action.nodeId}".` };
                    }
                    this.graphController.focusNode(action.nodeId);
                    return { applied: true, message: `Focused the graph on ${dataset.nodeById.get(action.nodeId).label}.` };

                case 'highlightNode':
                    if (!dataset.nodeById.has(action.nodeId)) {
                        return { applied: false, message: `Ignored unknown highlight node "${action.nodeId}".` };
                    }
                    this.graphController.highlightNodes([action.nodeId]);
                    return { applied: true, message: `Highlighted ${dataset.nodeById.get(action.nodeId).label}.` };

                case 'highlightNeighbors':
                case 'highlightNeighborhood': {
                    if (!dataset.nodeById.has(action.nodeId)) {
                        return { applied: false, message: `Ignored unknown neighborhood node "${action.nodeId}".` };
                    }
                    const depth = Math.min(3, Math.max(1, Number(action.depth) || 1));
                    const neighborhood = traversalUtils.collectNeighborhood(dataset, [action.nodeId], depth);
                    this.graphController.highlightNodes(neighborhood.nodeIds);
                    this.graphController.highlightEdges(neighborhood.edgeIds);
                    return { applied: true, message: `Highlighted a depth-${depth} neighborhood around ${dataset.nodeById.get(action.nodeId).label}.` };
                }

                case 'filterNodeTypes': {
                    const nodeTypes = Array.isArray(action.nodeTypes)
                        ? action.nodeTypes.filter(nodeType => dataset.nodeTypes.includes(nodeType))
                        : [];
                    if (nodeTypes.length === 0) {
                        return { applied: false, message: 'Ignored empty or invalid node-type filter.' };
                    }
                    this.graphController.setAssistantNodeTypeFilter(nodeTypes);
                    return { applied: true, message: `Filtered the view to ${nodeTypes.join(', ')}.` };
                }

                case 'fitSelectionIntoView': {
                    const nodeIds = Array.isArray(action.nodeIds)
                        ? action.nodeIds.filter(nodeId => dataset.nodeById.has(nodeId))
                        : this.graphController.getHighlightedNodeIds();
                    if (!nodeIds || nodeIds.length === 0) {
                        return { applied: false, message: 'Ignored fit-to-view because there was no valid selection.' };
                    }
                    this.graphController.fitNodeIds(nodeIds);
                    return { applied: true, message: 'Fit the current assistant selection into view.' };
                }

                case 'highlightShortestPath': {
                    if (!dataset.nodeById.has(action.fromNodeId) || !dataset.nodeById.has(action.toNodeId)) {
                        return { applied: false, message: 'Ignored shortest-path action because one or more node IDs were invalid.' };
                    }
                    const path = traversalUtils.findShortestPath(dataset, action.fromNodeId, action.toNodeId);
                    if (!path) {
                        return { applied: false, message: 'No path was found between the requested nodes.' };
                    }
                    this.graphController.highlightNodes(path.nodeIds);
                    this.graphController.highlightEdges(path.edgeIds);
                    return {
                        applied: true,
                        message: `Highlighted the shortest path from ${dataset.nodeById.get(action.fromNodeId).label} to ${dataset.nodeById.get(action.toNodeId).label}.`
                    };
                }

                default:
                    return { applied: false, message: `Ignored unsupported action type "${action.type}".` };
            }
        }
    }

    global.GraphActionInterpreter = GraphActionInterpreter;
})(window);
