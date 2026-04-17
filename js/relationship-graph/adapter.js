(function initializeRelationshipGraphAdapter(global) {
    'use strict';

    const graphConfig = global.RelationshipGraphConfig;

    function slugify(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    function pickNodeSummary(node) {
        return String(node?.description || node?.summary || '').trim();
    }

    function extractAttributes(node) {
        const hiddenKeys = new Set(['id', 'label', 'type', 'group', 'description', 'summary']);
        return Object.entries(node || {}).reduce((attributes, [key, value]) => {
            if (hiddenKeys.has(key)) return attributes;
            if (value === null || value === undefined) return attributes;
            if (Array.isArray(value) && value.length === 0) return attributes;
            if (value === '') return attributes;
            attributes[key] = value;
            return attributes;
        }, {});
    }

    function createSyntheticNodeClassReference(typeName) {
        const config = graphConfig.getNodeTypeConfig('NodeClassReference');
        return {
            id: `node-class-${slugify(typeName)}`,
            label: `${typeName} Class`,
            type: 'NodeClassReference',
            group: 'nodeClass',
            description: `Conceptual node-class reference used by AI capabilities to scope ${typeName} context.`,
            summary: `Conceptual reference for ${typeName} nodes.`,
            attributes: {
                referencedType: typeName
            },
            displayType: config.displayLabel,
            accent: config.accent,
            symbolKey: config.symbol,
            shortLabel: config.shortLabel,
            cluster: config.cluster,
            connectionCount: 0,
            isSynthetic: true,
            referencedType: typeName
        };
    }

    function transformDomainNode(node) {
        const config = graphConfig.getNodeTypeConfig(node.type);
        return {
            id: node.id,
            label: node.label,
            type: node.type,
            group: node.group,
            description: String(node.description || '').trim(),
            summary: pickNodeSummary(node),
            attributes: extractAttributes(node),
            displayType: config.displayLabel,
            accent: config.accent,
            symbolKey: config.symbol,
            shortLabel: config.shortLabel,
            cluster: config.cluster,
            connectionCount: 0,
            isSynthetic: false
        };
    }

    function mapOperationalContextDataset(rawDataset) {
        const rawNodes = Array.isArray(rawDataset?.nodes) ? rawDataset.nodes : [];
        const rawLinks = Array.isArray(rawDataset?.links) ? rawDataset.links : [];
        const rawNodeTypes = Array.isArray(rawDataset?.nodeTypes) ? rawDataset.nodeTypes : [];
        const rawEdgeTypes = Array.isArray(rawDataset?.edgeTypes) ? rawDataset.edgeTypes : [];

        const rawNodeById = new Map(rawNodes.map(node => [node.id, node]));
        const syntheticNodeIdByReference = new Map();

        rawLinks.forEach(link => {
            [link?.source, link?.target].forEach(reference => {
                if (!reference || rawNodeById.has(reference)) return;
                if (!syntheticNodeIdByReference.has(reference)) {
                    syntheticNodeIdByReference.set(reference, `node-class-${slugify(reference)}`);
                }
            });
        });

        const nodes = [
            ...rawNodes.map(transformDomainNode),
            ...Array.from(syntheticNodeIdByReference.keys()).map(createSyntheticNodeClassReference)
        ];

        const links = rawLinks.map((link, index) => {
            const relation = graphConfig.getRelationshipConfig(link.type);
            const source = syntheticNodeIdByReference.get(link.source) || link.source;
            const target = syntheticNodeIdByReference.get(link.target) || link.target;

            return {
                id: String(link.id || `operational-link-${index}-${slugify(source)}-${slugify(target)}-${slugify(link.type)}`),
                source,
                target,
                type: String(link.type || 'RELATED_TO'),
                label: String(link.label || relation.label),
                inverseLabel: relation.inverseLabel,
                family: relation.family,
                accent: relation.accent,
                width: relation.width,
                dasharray: relation.dasharray,
                weight: Number(link.weight) || 1
            };
        });

        const connectionCountByNodeId = new Map(nodes.map(node => [node.id, 0]));
        links.forEach(link => {
            connectionCountByNodeId.set(link.source, (connectionCountByNodeId.get(link.source) || 0) + 1);
            connectionCountByNodeId.set(link.target, (connectionCountByNodeId.get(link.target) || 0) + 1);
        });

        nodes.forEach(node => {
            node.connectionCount = connectionCountByNodeId.get(node.id) || 0;
        });

        return {
            meta: {
                ...(rawDataset?.meta || {}),
                displayNodeCount: nodes.length,
                displayLinkCount: links.length,
                nodeTypeCount: rawNodeTypes.length,
                aiCapabilityCount: nodes.filter(node => node.type === 'AICapability').length,
                syntheticNodeCount: nodes.filter(node => node.isSynthetic).length
            },
            nodeTypes: rawNodeTypes,
            edgeTypes: rawEdgeTypes,
            nodes,
            links
        };
    }

    global.RelationshipGraphAdapter = {
        mapOperationalContextDataset,
        pickNodeSummary
    };
})(window);
