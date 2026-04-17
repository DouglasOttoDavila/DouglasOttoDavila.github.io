(function initializeGraphTraversalUtils(global) {
    'use strict';

    function buildAdjacency(dataset) {
        const nodeById = dataset.nodeById || new Map(dataset.nodes.map(node => [node.id, node]));
        const adjacency = new Map();
        const edgeById = new Map(dataset.links.map(link => [link.id, link]));

        nodeById.forEach((_node, nodeId) => {
            adjacency.set(nodeId, []);
        });

        dataset.links.forEach(link => {
            const sourceId = link.source.id || link.source;
            const targetId = link.target.id || link.target;
            if (!adjacency.has(sourceId)) adjacency.set(sourceId, []);
            if (!adjacency.has(targetId)) adjacency.set(targetId, []);

            adjacency.get(sourceId).push({ nodeId: targetId, edgeId: link.id });
            adjacency.get(targetId).push({ nodeId: sourceId, edgeId: link.id });
        });

        return { nodeById, edgeById, adjacency };
    }

    function collectNeighborhood(dataset, seedNodeIds, depth = 1) {
        const { adjacency } = buildAdjacency(dataset);
        const maxDepth = Math.max(1, Number(depth) || 1);
        const queue = seedNodeIds.map(nodeId => ({ nodeId, depth: 0 }));
        const visitedNodes = new Set(seedNodeIds);
        const visitedEdges = new Set();

        while (queue.length > 0) {
            const current = queue.shift();
            if (current.depth >= maxDepth) continue;

            const neighbors = adjacency.get(current.nodeId) || [];
            neighbors.forEach(neighbor => {
                visitedEdges.add(neighbor.edgeId);
                if (!visitedNodes.has(neighbor.nodeId)) {
                    visitedNodes.add(neighbor.nodeId);
                    queue.push({ nodeId: neighbor.nodeId, depth: current.depth + 1 });
                }
            });
        }

        return {
            seedNodeIds: [...seedNodeIds],
            depth: maxDepth,
            nodeIds: [...visitedNodes],
            edgeIds: [...visitedEdges]
        };
    }

    function findShortestPath(dataset, fromNodeId, toNodeId) {
        const { adjacency } = buildAdjacency(dataset);
        if (!adjacency.has(fromNodeId) || !adjacency.has(toNodeId)) return null;
        if (fromNodeId === toNodeId) {
            return { nodeIds: [fromNodeId], edgeIds: [] };
        }

        const queue = [fromNodeId];
        const visited = new Set([fromNodeId]);
        const previousByNode = new Map();

        while (queue.length > 0) {
            const currentNodeId = queue.shift();
            const neighbors = adjacency.get(currentNodeId) || [];

            for (const neighbor of neighbors) {
                if (visited.has(neighbor.nodeId)) continue;
                visited.add(neighbor.nodeId);
                previousByNode.set(neighbor.nodeId, {
                    nodeId: currentNodeId,
                    edgeId: neighbor.edgeId
                });

                if (neighbor.nodeId === toNodeId) {
                    const nodeIds = [toNodeId];
                    const edgeIds = [];
                    let walkId = toNodeId;

                    while (previousByNode.has(walkId)) {
                        const previous = previousByNode.get(walkId);
                        edgeIds.unshift(previous.edgeId);
                        nodeIds.unshift(previous.nodeId);
                        walkId = previous.nodeId;
                    }

                    return { nodeIds, edgeIds };
                }

                queue.push(neighbor.nodeId);
            }
        }

        return null;
    }

    function findCandidateNodes(dataset, query, limit = 6) {
        const normalizedQuery = String(query || '').trim().toLowerCase();
        if (!normalizedQuery) return [];

        return dataset.nodes
            .filter(node => {
                const haystack = [node.label, node.displayType, node.summary, node.description]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                return haystack.includes(normalizedQuery);
            })
            .sort((left, right) => right.connectionCount - left.connectionCount || left.label.localeCompare(right.label))
            .slice(0, limit);
    }

    global.GraphTraversalUtils = {
        buildAdjacency,
        collectNeighborhood,
        findShortestPath,
        findCandidateNodes
    };
})(window);
