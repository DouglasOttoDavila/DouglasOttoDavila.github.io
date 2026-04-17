(function initializeRelationshipGraphConfig(global) {
    'use strict';

    const DEFAULT_TYPE_CONFIG = {
        displayLabel: 'Context Node',
        accent: '220 85% 64%',
        symbol: 'circle',
        cluster: { x: 0.5, y: 0.5 },
        size: 440,
        shortLabel: 'CTX',
        legend: true,
        order: 99
    };

    const NODE_TYPE_CONFIG = {
        Product: { displayLabel: 'Product', accent: '220 90% 63%', symbol: 'circle', cluster: { x: 0.14, y: 0.16 }, size: 980, shortLabel: 'PRD', legend: true, order: 1 },
        Feature: { displayLabel: 'Feature', accent: '198 90% 58%', symbol: 'square', cluster: { x: 0.29, y: 0.2 }, size: 760, shortLabel: 'FEA', legend: true, order: 2 },
        UserJourney: { displayLabel: 'User Journey', accent: '173 68% 49%', symbol: 'triangle', cluster: { x: 0.43, y: 0.18 }, size: 660, shortLabel: 'JRNY', legend: true, order: 3 },
        Requirement: { displayLabel: 'Requirement', accent: '146 70% 48%', symbol: 'diamond', cluster: { x: 0.28, y: 0.38 }, size: 700, shortLabel: 'REQ', legend: true, order: 4 },
        Screen: { displayLabel: 'Screen', accent: '38 92% 62%', symbol: 'square', cluster: { x: 0.15, y: 0.46 }, size: 540, shortLabel: 'UI', legend: true, order: 5 },
        API: { displayLabel: 'API', accent: '340 82% 64%', symbol: 'diamond', cluster: { x: 0.48, y: 0.38 }, size: 560, shortLabel: 'API', legend: true, order: 6 },
        Service: { displayLabel: 'Service', accent: '314 72% 63%', symbol: 'wye', cluster: { x: 0.62, y: 0.42 }, size: 520, shortLabel: 'SVC', legend: true, order: 7 },
        TestCase: { displayLabel: 'Test Case', accent: '95 74% 56%', symbol: 'circle', cluster: { x: 0.34, y: 0.63 }, size: 500, shortLabel: 'TC', legend: true, order: 8 },
        TestSuite: { displayLabel: 'Test Suite', accent: '72 72% 56%', symbol: 'star', cluster: { x: 0.18, y: 0.72 }, size: 620, shortLabel: 'SU', legend: true, order: 9 },
        Defect: { displayLabel: 'Defect', accent: '12 93% 62%', symbol: 'triangle', cluster: { x: 0.56, y: 0.63 }, size: 640, shortLabel: 'BUG', legend: true, order: 10 },
        RCA: { displayLabel: 'RCA', accent: '0 0% 72%', symbol: 'cross', cluster: { x: 0.68, y: 0.7 }, size: 580, shortLabel: 'RCA', legend: true, order: 11 },
        Deployment: { displayLabel: 'Deployment', accent: '28 82% 59%', symbol: 'square', cluster: { x: 0.8, y: 0.58 }, size: 540, shortLabel: 'DEP', legend: true, order: 12 },
        Region: { displayLabel: 'Region', accent: '188 66% 61%', symbol: 'wye', cluster: { x: 0.79, y: 0.21 }, size: 420, shortLabel: 'REG', legend: true, order: 13 },
        Language: { displayLabel: 'Language', accent: '48 88% 61%', symbol: 'star', cluster: { x: 0.83, y: 0.32 }, size: 420, shortLabel: 'L10N', legend: true, order: 14 },
        AICapability: { displayLabel: 'AI Capability', accent: '276 82% 68%', symbol: 'circle', cluster: { x: 0.79, y: 0.82 }, size: 860, shortLabel: 'AI', legend: true, order: 15 },
        NodeClassReference: { displayLabel: 'Node Class', accent: '286 42% 74%', symbol: 'cross', cluster: { x: 0.9, y: 0.76 }, size: 260, shortLabel: 'CLS', legend: false, order: 99 }
    };

    const RELATION_FAMILY_STYLE = {
        structure: { accent: '214 88% 66%', width: 1.9, dasharray: '' },
        implementation: { accent: '182 82% 59%', width: 1.85, dasharray: '' },
        quality: { accent: '120 72% 60%', width: 1.8, dasharray: '5 5' },
        incident: { accent: '18 96% 66%', width: 2, dasharray: '' },
        intelligence: { accent: '294 74% 72%', width: 1.85, dasharray: '3 6' },
        locale: { accent: '48 86% 64%', width: 1.7, dasharray: '2 6' },
        default: { accent: '220 18% 62%', width: 1.7, dasharray: '' }
    };

    const RELATIONSHIP_CONFIG = {
        AFFECTS_SCREEN: { label: 'Affects screen', inverseLabel: 'Affected by', family: 'implementation' },
        AVAILABLE_IN: { label: 'Available in', inverseLabel: 'Supports product', family: 'locale' },
        BACKED_BY: { label: 'Backed by', inverseLabel: 'Backs API', family: 'implementation' },
        CONSIDERS: { label: 'Considers', inverseLabel: 'Considered by', family: 'intelligence' },
        CONTAINS: { label: 'Contains', inverseLabel: 'Included in', family: 'quality' },
        CONTEXTUALIZES_WITH: { label: 'Contextualizes with', inverseLabel: 'Context for', family: 'intelligence' },
        CORRELATES_WITH: { label: 'Correlates with', inverseLabel: 'Correlates with', family: 'incident' },
        DEPENDS_ON: { label: 'Depends on', inverseLabel: 'Dependency for', family: 'structure' },
        ENRICHES: { label: 'Enriches', inverseLabel: 'Enriched by', family: 'intelligence' },
        FAILED_ON: { label: 'Failed on', inverseLabel: 'Failure exposed by', family: 'incident' },
        GENERATES_FROM: { label: 'Generates from', inverseLabel: 'Generation source for', family: 'intelligence' },
        HAS_FEATURE: { label: 'Has feature', inverseLabel: 'Feature of', family: 'structure' },
        HAS_RCA: { label: 'Has RCA', inverseLabel: 'Explains defect', family: 'incident' },
        HAS_REQUIREMENT: { label: 'Has requirement', inverseLabel: 'Requirement of', family: 'structure' },
        IMPLEMENTS_VIA: { label: 'Implements via', inverseLabel: 'Implements for', family: 'implementation' },
        INTRODUCED_IN: { label: 'Introduced in', inverseLabel: 'Introduced', family: 'incident' },
        INVESTIGATES: { label: 'Investigates', inverseLabel: 'Investigated by', family: 'intelligence' },
        LOOKS_BACK_TO: { label: 'Looks back to', inverseLabel: 'Historical input for', family: 'intelligence' },
        RECOMMENDS_SIMILAR_TO: { label: 'Recommends similar to', inverseLabel: 'Recommendation anchor for', family: 'intelligence' },
        RELATED_TO: { label: 'Related to', inverseLabel: 'Related to', family: 'structure' },
        RELATES_TO: { label: 'Relates to', inverseLabel: 'Related defect', family: 'incident' },
        SUPPORTED_LANGUAGE: { label: 'Supports language', inverseLabel: 'Supported by', family: 'locale' },
        SUPPORTS_JOURNEY: { label: 'Supports journey', inverseLabel: 'Supported by', family: 'structure' },
        SURFACES: { label: 'Surfaces', inverseLabel: 'Surfaced by', family: 'intelligence' },
        USES_NODE_CLASS: { label: 'Uses node class', inverseLabel: 'Referenced by AI capability', family: 'intelligence' },
        VALIDATED_BY: { label: 'Validated by', inverseLabel: 'Validates', family: 'quality' }
    };

    function humanizeConstant(value) {
        return String(value || '')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/_/g, ' ')
            .trim();
    }

    function getNodeTypeConfig(type) {
        const config = NODE_TYPE_CONFIG[type];
        return config ? { ...DEFAULT_TYPE_CONFIG, ...config } : { ...DEFAULT_TYPE_CONFIG, displayLabel: humanizeConstant(type) || DEFAULT_TYPE_CONFIG.displayLabel };
    }

    function getRelationshipConfig(type) {
        const relationship = RELATIONSHIP_CONFIG[type] || { label: humanizeConstant(type), inverseLabel: humanizeConstant(type), family: 'default' };
        const familyStyle = RELATION_FAMILY_STYLE[relationship.family] || RELATION_FAMILY_STYLE.default;
        return {
            ...relationship,
            ...familyStyle
        };
    }

    function getNodeSymbolType(symbolKey, d3) {
        switch (symbolKey) {
            case 'cross':
                return d3.symbolCross;
            case 'diamond':
                return d3.symbolDiamond;
            case 'square':
                return d3.symbolSquare;
            case 'star':
                return d3.symbolStar;
            case 'triangle':
                return d3.symbolTriangle;
            case 'wye':
                return d3.symbolWye;
            case 'circle':
            default:
                return d3.symbolCircle;
        }
    }

    global.RelationshipGraphConfig = {
        NODE_TYPE_CONFIG,
        RELATIONSHIP_CONFIG,
        humanizeConstant,
        getNodeTypeConfig,
        getRelationshipConfig,
        getNodeSymbolType
    };
})(window);
