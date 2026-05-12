window.HomeRoadmapData = {
  defaultRole: 'recruiter',
  defaultAvailabilityView: 'recruiter',
  defaultFilter: 'all',
  defaultSkill: 'automation',
  metricHelpText: 'Each metric maps to career evidence below, so the homepage leads with measurable outcomes before asking visitors to parse the full timeline.',
  roleActions: [
    {
      label: 'Resume',
      href: 'https://drive.google.com/file/d/1AWl9S0oBfP9YzF3QjT9_MsPhbzxOsyQP/view?usp=sharing',
      external: true
    },
    {
      label: 'Contact',
      href: 'mailto:douglas.odavila@gmail.com'
    }
  ],
  roleLenses: [
    {
      id: 'recruiter',
      label: 'Recruiter',
      headline: 'Fast role fit, location clarity, and measurable credibility.',
      description: 'Recruiters can immediately see seniority, current focus, availability, and the proof points that support a resume conversation.'
    },
    {
      id: 'qa-lead',
      label: 'QA Lead',
      headline: 'Framework depth, test architecture, and quality signal discipline.',
      description: 'QA leaders get the clearest view of automation architecture, test strategy, CI/CD integration, and the operating habits that sustain coverage.'
    },
    {
      id: 'engineering-manager',
      label: 'Engineering Manager',
      headline: 'Delivery confidence, team enablement, and regression risk control.',
      description: 'Engineering managers can scan for release acceleration, reduced regression drag, and the collaboration model behind faster delivery.'
    },
    {
      id: 'cto',
      label: 'CTO',
      headline: 'AI-enhanced SDLC adoption with practical governance and scale.',
      description: 'Executives see how automation, quality intelligence, and AI workflows connect to productivity, governance, and innovation adoption.'
    }
  ],
  impactMetrics: [
    {
      icon: 'fa-solid fa-wand-magic-sparkles',
      value: '35%',
      countTo: 35,
      countSuffix: '%',
      label: 'less manual QA overhead',
      detail: 'AI-assisted validation and test generation reduced repetitive handoffs.',
      metricTarget: 'mission-sdet',
      roleFocus: ['recruiter', 'engineering-manager', 'cto'],
      active: true,
      tone: 'blue'
    },
    {
      icon: 'fa-solid fa-gauge-high',
      value: '40%',
      countTo: 40,
      countSuffix: '%',
      label: 'faster release verification',
      detail: 'AI added to CI/CD quality gates shortened the path to release confidence.',
      metricTarget: 'mission-sdet',
      roleFocus: ['engineering-manager', 'cto'],
      tone: 'cyan'
    },
    {
      icon: 'fa-solid fa-layer-group',
      value: '50%',
      countTo: 50,
      countSuffix: '%',
      label: 'reduced regression execution time',
      detail: 'Framework strategy and reporting discipline made suites faster and more dependable.',
      metricTarget: 'mission-qa-lead',
      roleFocus: ['qa-lead', 'engineering-manager'],
      tone: 'green'
    },
    {
      icon: 'fa-solid fa-shield-heart',
      value: '90%+',
      countTo: 90,
      countSuffix: '%+',
      label: 'test coverage achieved',
      detail: 'Structured planning in TestRail and Zephyr kept complex eCommerce estates visible.',
      metricTarget: 'mission-qa-engineer',
      roleFocus: ['recruiter', 'qa-lead', 'cto'],
      tone: 'purple'
    }
  ],
  valueEngine: {
    title: 'Core capabilities that drive measurable outcomes.',
    linkLabel: '',
    cards: [
      {
        title: 'AI-Driven QA',
        icon: 'fa-solid fa-brain',
        tone: 'purple',
        roleFocus: ['qa-lead', 'cto'],
        skillGroup: 'ai-hyperautomation',
        summary: 'Leverage LLMs for test design, generation, requirements review, defect triage, and semantic QA validation.',
        detail: 'Best when a team needs faster insight without losing test intent or traceability.',
        chips: ['LLMs', 'Prompt Engineering', 'GenAI', 'AI QA']
      },
      {
        title: 'Automation Architecture',
        icon: 'fa-solid fa-cubes',
        tone: 'cyan',
        roleFocus: ['qa-lead', 'engineering-manager'],
        skillGroup: 'automation',
        summary: 'Design scalable frameworks, modular libraries, resilient selectors, and reliable CI/CD quality gates.',
        detail: 'Built for organizations that need consistent signals across products, teams, and pipelines.',
        chips: ['Playwright', 'Cypress', 'WebdriverIO', 'Selenium']
      },
      {
        title: 'Quality Intelligence',
        icon: 'fa-solid fa-chart-line',
        tone: 'blue',
        roleFocus: ['engineering-manager', 'cto'],
        skillGroup: 'quality-strategy',
        summary: 'Turn test data into observability, trends, risk detection, and reporting dashboards that surface action early.',
        detail: 'Useful when leaders need fewer surprise regressions and clearer release posture.',
        chips: ['Reporting', 'Dashboards', 'Risk Analysis', 'Observability']
      },
      {
        title: 'Delivery Acceleration',
        icon: 'fa-solid fa-bolt',
        tone: 'green',
        roleFocus: ['engineering-manager', 'cto', 'recruiter'],
        skillGroup: 'delivery',
        summary: 'Shorten verification loops with pipeline optimization, parallel execution, shift-left testing, and DevOps alignment.',
        detail: 'The outcome is steadier releases, quicker confidence, and fewer interruptions for engineering teams.',
        chips: ['CI/CD', 'DevOps', 'Shift-Left', 'Quality Gates']
      }
    ]
  },
  availability: {
    title: 'Remote-first QA automation leadership from Porto Alegre, Brazil.',
    views: [
      {
        id: 'recruiter',
        label: 'Recruiter View',
        rows: [
          { label: 'Base', value: 'Porto Alegre, Brazil' },
          { label: 'Remote', value: 'Americas and Europe' },
          { label: 'Time Zone', value: 'BRT / UTC-3' },
          { label: 'Best Overlap', value: 'Americas' }
        ],
        description: 'A quick read for recruiters: location is stable, collaboration windows are broad, and the current focus remains aligned with senior QA automation roles.'
      },
      {
        id: 'technical-lead',
        label: 'Technical Lead View',
        rows: [
          { label: 'Primary Focus', value: 'AI-powered test automation' },
          { label: 'Pipeline Lens', value: 'CI/CD quality gates' },
          { label: 'Delivery Style', value: 'Remote-first collaboration' },
          { label: 'Coverage Goal', value: 'Engineering productivity at scale' }
        ],
        description: 'For technical leads, the emphasis is framework dependability, release signals, and shared ownership across product, QA, and DevOps.'
      },
      {
        id: 'executive',
        label: 'Executive View',
        rows: [
          { label: 'Operating Zone', value: 'Cross-region remote delivery' },
          { label: 'Primary Value', value: 'Faster quality feedback loops' },
          { label: 'Transformation Lens', value: 'AI-enhanced SDLC' },
          { label: 'Adoption Style', value: 'Governed, measurable rollout' }
        ],
        description: 'Executives get the strategic picture: scalable QA systems, cleaner governance, and practical AI adoption without novelty theater.'
      }
    ],
    ctas: [
      {
        label: 'Book a Discovery Call',
        href: 'https://cal.com/douglas-odavila',
        icon: 'fa-solid fa-calendar-days',
        variant: 'btn-primary',
        external: true
      },
      {
        label: 'Download Resume (PDF)',
        href: 'https://drive.google.com/file/d/1AWl9S0oBfP9YzF3QjT9_MsPhbzxOsyQP/view?usp=sharing',
        icon: 'fa-solid fa-file-arrow-down',
        variant: 'btn-outline-light',
        external: true
      }
    ]
  },
  timeline: {
    title: 'Current role first, deeper history on demand.',
    description: 'The timeline keeps the strongest current proof expanded while older roles stay compact for quick scanning.',
    filters: [
      { id: 'all', label: 'All', active: true },
      { id: 'ai-llm', label: 'AI/LLM' },
      { id: 'automation', label: 'Automation' },
      { id: 'leadership', label: 'Leadership' },
      { id: 'ci-cd', label: 'CI/CD' },
      { id: 'ecommerce', label: 'eCommerce' },
      { id: 'api-testing', label: 'API Testing' }
    ],
    missions: [
      {
        id: 'mission-sdet',
        title: 'Software Development Engineer in Test (SDET) · Object Edge',
        location: 'Brazil · Hybrid',
        start: 'Apr 2024',
        end: 'Present',
        summary: 'Building AI-powered QA applications and automation workflows that accelerate SDLC quality gates across enterprise-scale eCommerce projects.',
        tags: ['AI/LLM', 'Playwright', 'CI/CD', 'TypeScript', 'GenAI', 'Automation'],
        filters: ['ai-llm', 'automation', 'ci-cd', 'ecommerce'],
        roleFocus: ['recruiter', 'engineering-manager', 'cto'],
        tone: 'blue',
        expanded: true,
        bullets: [
          'Designed and deployed AI-powered QA applications to accelerate SDLC across enterprise-scale eCommerce projects.',
          'Built intelligent automation solutions for test case generation, defect analysis, and requirements validation.',
          'Drove innovation by embedding generative AI into CI/CD workflows, cutting release verification time by 40%.',
          'Partnered with cross-functional teams to adopt AI-enhanced automation across projects.'
        ],
        details: {
          Context: 'Enterprise eCommerce delivery needed faster release certainty.',
          Action: 'Introduced AI-assisted workflows and automation-ready guardrails.',
          Result: 'Reduced manual QA overhead and improved verification speed.',
          Tools: 'Playwright, TypeScript, GenAI, CI/CD'
        }
      },
      {
        id: 'mission-qa-lead',
        title: 'QA Automation Lead · Object Edge',
        location: 'Brazil · Hybrid',
        start: 'Jan 2023',
        end: 'Apr 2024',
        summary: 'Led QA automation strategy and team enablement across multiple client projects.',
        tags: ['Cypress', 'WebdriverIO', 'CI/CD', 'Jira', 'Leadership', 'Test Strategy'],
        filters: ['automation', 'leadership', 'ci-cd'],
        roleFocus: ['qa-lead', 'engineering-manager'],
        tone: 'green',
        bullets: [
          'Led QA Automation practice across multiple client projects.',
          'Implemented test automation strategy that reduced regression execution time by 50%.',
          'Introduced best practices in test design, reporting, and CI integration, improving defect detection by 20%.',
          'Managed performance and mentoring, improving team productivity and reducing defect leakage.'
        ],
        details: {
          Context: 'Multiple delivery streams needed one QA operating model.',
          Action: 'Established standards, mentoring loops, and reporting discipline.',
          Result: 'Regression cycles shortened while detection quality improved.',
          Tools: 'Cypress, WebdriverIO, Jira, CI/CD'
        }
      },
      {
        id: 'mission-qa-engineer',
        title: 'Quality Assurance Engineer · Object Edge',
        location: 'Brazil · Hybrid',
        start: 'Feb 2020',
        end: 'Jan 2023',
        summary: 'Delivered QA for Oracle eCommerce platforms and complex middleware integrations.',
        tags: ['Selenium', 'WebdriverIO', 'Cypress', 'Postman', 'JMeter', 'TestRail', 'Zephyr', 'eCommerce', 'API Testing'],
        filters: ['automation', 'ecommerce', 'api-testing'],
        roleFocus: ['qa-lead', 'recruiter', 'engineering-manager'],
        tone: 'cyan',
        bullets: [
          'Delivered QA for Oracle eCommerce platforms (OCC/OIC) with complex middleware integrations.',
          'Automated regression suites using Selenium, WebdriverIO, and Cypress, cutting manual testing effort by 60%.',
          'Built and executed API tests with Postman and performance and stress tests with JMeter.',
          'Designed test plans in TestRail and Zephyr, achieving 90%+ test coverage.',
          'Collaborated with Agile and Scrum teams to ensure faster releases and improved sprint QA velocity.'
        ],
        details: {
          Context: 'Commerce platforms and middleware integrations increased regression risk.',
          Action: 'Built layered automation and API performance validation.',
          Result: 'Manual effort dropped while coverage and release pace increased.',
          Tools: 'Selenium, WebdriverIO, Cypress, Postman, JMeter'
        }
      },
      {
        id: 'mission-support-assistant',
        title: 'Technical Support Assistant · Lojas Virtuais BR',
        location: 'Greater Porto Alegre',
        start: 'Jun 2019',
        end: 'Feb 2020',
        summary: 'Supported eCommerce clients with platform troubleshooting, integrations, and operational stability.',
        tags: ['eCommerce', 'ERP', 'Gateways', 'Support', 'Troubleshooting'],
        filters: ['ecommerce'],
        roleFocus: ['recruiter', 'engineering-manager'],
        tone: 'gold',
        bullets: [
          'Provided technical support for eCommerce platform clients, troubleshooting system issues and integrations.',
          'Assisted with ERP and payment gateway integrations, ensuring smooth operations for online stores.',
          'Diagnosed and resolved errors in web applications, improving customer satisfaction and platform stability.'
        ],
        details: {
          Context: 'Clients depended on stable storefront operations and integrations.',
          Action: 'Troubleshot defects and supported ERP and payment connectivity.',
          Result: 'Operational stability improved and customer friction decreased.',
          Tools: 'eCommerce platforms, ERP, payment gateways'
        }
      },
      {
        id: 'mission-early-career',
        title: 'Early Career · Support & Operations',
        location: 'Public sector, commerce, and business management',
        start: '2008',
        end: '2019',
        summary: 'Built a foundation in process rigor, technical support, operations, documentation, and stakeholder communication.',
        tags: ['Operations', 'Support', 'Documentation', 'Process', 'IT Maintenance'],
        filters: ['leadership'],
        roleFocus: ['recruiter'],
        tone: 'slate',
        bullets: [
          'Technical support roles across government, business management, and military service.',
          'System installation, configuration, and troubleshooting for networks, hardware, and software.',
          'Built foundation in process rigor, documentation, compliance, and stakeholder communication.',
          'Administrative and operational support including inventory management, customer service, and IT maintenance.'
        ],
        details: {
          Context: 'Operational environments required dependability and clear process handling.',
          Action: 'Supported infrastructure, people, and administrative routines.',
          Result: 'Created the discipline that later scaled into automation leadership.',
          Tools: 'Networks, hardware, software support, process documentation'
        }
      }
    ]
  },
  knowledge: {
    layers: [
      {
        label: 'Emerging Edge',
        tone: 'purple',
        chips: ['AI QA', 'LLM Workflows', 'Prompt Engineering', 'Hyperautomation', 'Observability', 'Agentic QA', 'Low-Code Automation']
      },
      {
        label: 'Professional Practice',
        tone: 'blue',
        chips: ['QA Automation', 'Playwright', 'Cypress', 'WebdriverIO', 'API Testing', 'CI/CD', 'Test Strategy', 'eCommerce QA']
      },
      {
        label: 'Foundation',
        tone: 'slate',
        chips: ['Systems Analysis', 'Programming Fundamentals', 'Networking', 'Technical Support', 'Systems Support']
      }
    ],
    education: [
      {
        title: 'System Analysis and Development',
        subtitle: 'UniRitter · 2021 - 2023',
        description: 'Focused on software engineering, automation patterns, and quality metrics.'
      },
      {
        title: 'Technical Informatics Program',
        subtitle: 'QI Faculdade & Escola Tecnica · 2010 - 2012',
        description: 'Grounded in networking, programming fundamentals, and systems support.'
      }
    ]
  },
  recognition: {
    overline: 'Peer-to-Peer Winner',
    title: 'Object Edge Inc. · May 2023',
    description: 'Honored for mentorship, training excellence, and driving automation best practices across teams.',
    whyItMatters: 'This recognition reinforces one of my strongest professional traits: I do not only build automation - I help teams adopt it.'
  },
  skills: {
    readouts: {
      automation: {
        title: 'Automation foundations that keep delivery predictable.',
        description: 'Framework selection, selector resilience, and maintainable libraries are the orbit around every later optimization.'
      },
      'ai-hyperautomation': {
        title: 'AI and hyperautomation used as force multipliers, not decoration.',
        description: 'The emphasis is on requirements analysis, semantic validation, and workflow acceleration that still respects engineering rigor.'
      },
      delivery: {
        title: 'Delivery systems tuned for confidence, not just speed.',
        description: 'CI/CD quality gates, DevOps alignment, and repeatable release feedback loops keep teams shipping with fewer surprises.'
      },
      'quality-strategy': {
        title: 'Quality strategy that turns signals into decisions.',
        description: 'Risk analysis, observability, and requirements review connect the roadmap to practical governance and sharper prioritization.'
      }
    },
    clusters: [
      {
        id: 'automation',
        label: 'Automation',
        active: true,
        items: ['Playwright', 'Cypress', 'WebdriverIO', 'Selenium']
      },
      {
        id: 'ai-hyperautomation',
        label: 'AI & Hyperautomation',
        items: ['AI QA', 'LLM Workflows', 'Prompt Engineering', 'GenAI', 'Low-Code', 'n8n']
      },
      {
        id: 'delivery',
        label: 'Delivery',
        items: ['CI/CD', 'DevOps', 'Docker', 'GitHub Actions', 'Quality Gates']
      },
      {
        id: 'quality-strategy',
        label: 'Quality Strategy',
        items: ['Test Strategy', 'Risk Analysis', 'Observability', 'Quality Intelligence', 'Requirements Review']
      }
    ],
    tools: ['TypeScript', 'JavaScript', 'Python', 'Postman', 'JMeter', 'MySQL', 'Allure', 'Grafana', 'Jira', 'Confluence', 'TestRail', 'Zephyr', 'Git', 'Docker', 'Kubernetes', 'AWS'],
    toolCategories: [
      { label: 'AI & Orchestration', items: ['GitHub Copilot', 'LangChain', 'Langfuse', 'n8n', 'Azure AI Foundry', 'Azure AI Search'] },
      { label: 'Languages & Frameworks', items: ['TypeScript', 'JavaScript', 'Python', 'Playwright', 'Cypress', 'WebdriverIO', 'Postman', 'JMeter'] },
      { label: 'Infrastructure & Delivery', items: ['GitHub Actions', 'GitLab CI', 'Docker', 'Kubernetes', 'AWS', 'Git'] },
      { label: 'Observability & Reporting', items: ['Allure', 'Grafana', 'MySQL', 'Jira', 'TestRail', 'Zephyr', 'Confluence'] }
    ],
    toolsNote: 'Also work with Oracle eCommerce (OCC/OIC), REST/SOAP, SQL, Linux, Bash, and enterprise tooling.'
  },
  cta: {
    title: 'Need stronger release confidence?',
    subtitle: "Let's connect and shape a quality strategy your engineering team can measure.",
    buttons: [
      {
        label: 'Email Douglas',
        href: 'mailto:douglas.odavila@gmail.com',
        icon: 'fa-solid fa-paper-plane',
        variant: 'btn-primary'
      },
      {
        label: 'Schedule a Strategy Session',
        href: 'https://cal.com/douglas-odavila',
        icon: 'fa-solid fa-video',
        variant: 'btn-outline-primary',
        external: true
      },
      {
        label: 'Connect on LinkedIn',
        href: 'http://www.linkedin.com/in/douglasottodavila',
        icon: 'fab fa-linkedin',
        variant: 'btn-outline-light',
        external: true
      }
    ]
  }
};
