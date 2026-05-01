import { corsHeaders } from '../_shared/cors.ts';

type SupabaseAuthUser = {
  id?: string;
  email?: string;
};

type AnalyzerRequestPayload = {
  story_content?: string;
};

type AnalyzerPromptCatalog = {
  [key: string]: string;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const access = await requirePrivilegedUser(request);
    if (!access.ok) {
      return jsonResponse({ error: access.error }, access.status);
    }

    const payload = await request.json() as AnalyzerRequestPayload;
    const storyContent = String(payload?.story_content || '').trim();
    if (!storyContent) {
      return jsonResponse({ error: 'User story content is required.' }, 400);
    }
    const promptCatalog = await loadAnalyzerPromptCatalog();
    // Local deterministic analysis mode (no external webhook dependency).
    const localAnalysis = buildLocalAnalysis(storyContent, promptCatalog);
    return jsonResponse(localAnalysis, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected analyzer error.';
    return jsonResponse({ error: message }, 500);
  }
});

async function requirePrivilegedUser(request: Request): Promise<{ ok: true; user: SupabaseAuthUser } | { ok: false; status: number; error: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, status: 500, error: 'Analyzer authorization is not configured.' };
  }

  const authHeader = request.headers.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) {
    return { ok: false, status: 401, error: 'Log in to unlock the user story analyzer.' };
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`
    }
  });

  if (!userResponse.ok) {
    return { ok: false, status: 401, error: 'Log in to unlock the user story analyzer.' };
  }

  const user = await userResponse.json() as SupabaseAuthUser;
  if (!user?.id) {
    return { ok: false, status: 401, error: 'Log in to unlock the user story analyzer.' };
  }

  const profileUrl = new URL('/rest/v1/profiles', supabaseUrl);
  profileUrl.searchParams.set('select', 'has_privileges');
  profileUrl.searchParams.set('user_id', `eq.${user.id}`);
  profileUrl.searchParams.set('limit', '1');

  const profileResponse = await fetch(profileUrl, {
    headers: {
      apikey: supabaseServiceRoleKey || supabaseAnonKey,
      Authorization: `Bearer ${supabaseServiceRoleKey || token}`,
      Accept: 'application/json'
    }
  });

  if (!profileResponse.ok) {
    return { ok: false, status: 403, error: 'Your account is not approved for this AI feature.' };
  }

  const profiles = await profileResponse.json() as Array<{ has_privileges?: boolean }>;
  if (!profiles.some(profile => profile?.has_privileges === true)) {
    return { ok: false, status: 403, error: 'Your account is not approved for this AI feature.' };
  }

  return { ok: true, user };
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

function buildLocalAnalysis(storyContent: string, prompts: AnalyzerPromptCatalog): Record<string, unknown> {
  const normalized = storyContent.trim();
  const lower = normalized.toLowerCase();

  const actorMatch = normalized.match(/as\s+an?\s+(.+?)(?:,|\s+i\s+want)/i);
  const wantMatch = normalized.match(/i\s+want(?:\s+to)?\s+(.+?)(?:\s+so\s+that|\.|$)/i);
  const benefitMatch = normalized.match(/so\s+that\s+(.+?)(?:\.|$)/i);

  const hasAnd = /\band\b/i.test(normalized);
  const hasGivenWhenThen = /\bgiven\b/i.test(lower) && /\bwhen\b/i.test(lower) && /\bthen\b/i.test(lower);
  const hasBenefit = Boolean(benefitMatch);
  const hasActor = Boolean(actorMatch);
  const hasWant = Boolean(wantMatch);
  const hasAmbiguousWords = /\bfast|quickly|easy|simple|improve|optimi[sz]e|better\b/i.test(lower);
  const hasEstimateSignals = /\bwithin\s+\d+|less\s+than\s+\d+|under\s+\d+|at\s+least\s+\d+|up\s+to\s+\d+\b/i.test(lower);
  const length = normalized.length;

  const independent = clampScore(3 + (hasAnd ? -1 : 1) + (hasActor ? 1 : 0));
  const negotiable = clampScore(3 + (hasAmbiguousWords ? 0 : 1) + (/\bmust|shall|exactly\b/i.test(lower) ? -1 : 0));
  const valuable = clampScore(2 + (hasBenefit ? 2 : 0) + (/\buser|customer|business|revenue|risk|quality\b/i.test(lower) ? 1 : 0));
  const estimable = clampScore(2 + (hasActor && hasWant ? 1 : 0) + (hasEstimateSignals ? 2 : 0) + (hasAmbiguousWords ? -1 : 0));
  const small = clampScore(5 + (length > 500 ? -2 : 0) + (length > 800 ? -1 : 0) + (hasAnd ? -1 : 0));
  const testable = clampScore(2 + (hasGivenWhenThen ? 2 : 0) + (/\bacceptance criteria\b/i.test(lower) ? 1 : 0) + (hasEstimateSignals ? 1 : 0));

  const missing: string[] = [];
  if (!hasActor) missing.push(prompts['missing.actor']);
  if (!hasWant) missing.push(prompts['missing.want']);
  if (!hasBenefit) missing.push(prompts['missing.benefit']);
  if (!hasGivenWhenThen) missing.push(prompts['missing.gherkin']);
  if (!hasEstimateSignals) missing.push(prompts['missing.thresholds']);

  const actor = safeText(actorMatch?.[1]) || prompts['rewrite.default_actor'];
  const desiredOutcome = safeText(wantMatch?.[1]) || prompts['rewrite.default_outcome'];
  const benefit = safeText(benefitMatch?.[1]) || prompts['rewrite.default_benefit'];

  const rewrittenStory = formatPromptTemplate(prompts['rewrite.story_template'], {
    actor,
    desiredOutcome,
    benefit
  });
  const gherkinAcceptanceCriteria = [
    formatPromptTemplate(prompts['gherkin.given_template'], { desiredOutcome }),
    formatPromptTemplate(prompts['gherkin.when_template'], { desiredOutcome }),
    formatPromptTemplate(prompts['gherkin.then_template'], { desiredOutcome })
  ].join('\n');

  const overallComment = createOverallComment({
    independent,
    negotiable,
    valuable,
    estimable,
    small,
    testable
  }, prompts);

  return {
    source: 'local',
    invest_score: {
      independent,
      negotiable,
      valuable,
      estimable,
      small,
      testable,
      overall_comment: overallComment
    },
    story_improvement: {
      body: {
        independentSuggestion: hasAnd
          ? prompts['suggestion.independent.split']
          : prompts['suggestion.independent.focus'],
        negotiableSuggestion: hasAmbiguousWords
          ? prompts['suggestion.negotiable.replace_ambiguous']
          : prompts['suggestion.negotiable.keep_outcome_focused'],
        valuableSuggestion: hasBenefit
          ? prompts['suggestion.valuable.retain_value']
          : prompts['suggestion.valuable.add_so_that'],
        estimableSuggestion: hasEstimateSignals
          ? prompts['suggestion.estimable.refine_scope']
          : prompts['suggestion.estimable.add_metrics'],
        smallSuggestion: length > 500 || hasAnd
          ? prompts['suggestion.small.reduce_scope']
          : prompts['suggestion.small.keep_concise'],
        testableSuggestion: hasGivenWhenThen
          ? prompts['suggestion.testable.keep_gherkin']
          : prompts['suggestion.testable.add_gherkin'],
        rewrittenStory,
        gherkinAcceptanceCriteria,
        missingContextOrDependencies: missing.length
          ? missing.join(' ')
          : prompts['missing.none'],
        overallComment
      }
    }
  };
}

function createOverallComment(scores: {
  independent: number;
  negotiable: number;
  valuable: number;
  estimable: number;
  small: number;
  testable: number;
}, prompts: AnalyzerPromptCatalog): string {
  const average = (
    scores.independent
    + scores.negotiable
    + scores.valuable
    + scores.estimable
    + scores.small
    + scores.testable
  ) / 6;

  if (average >= 4.5) {
    return prompts['overall.high'];
  }
  if (average >= 3.5) {
    return prompts['overall.medium'];
  }
  return prompts['overall.low'];
}

function clampScore(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value)));
}

function safeText(value: string | undefined): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function formatPromptTemplate(template: string, values: Record<string, string>) {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const value = values[key];
    return value === undefined || value === null ? '' : value;
  });
}

async function loadAnalyzerPromptCatalog(): Promise<AnalyzerPromptCatalog> {
  const requiredPromptKeys = [
    'missing.actor',
    'missing.want',
    'missing.benefit',
    'missing.gherkin',
    'missing.thresholds',
    'missing.none',
    'rewrite.default_actor',
    'rewrite.default_outcome',
    'rewrite.default_benefit',
    'rewrite.story_template',
    'gherkin.given_template',
    'gherkin.when_template',
    'gherkin.then_template',
    'suggestion.independent.split',
    'suggestion.independent.focus',
    'suggestion.negotiable.replace_ambiguous',
    'suggestion.negotiable.keep_outcome_focused',
    'suggestion.valuable.retain_value',
    'suggestion.valuable.add_so_that',
    'suggestion.estimable.refine_scope',
    'suggestion.estimable.add_metrics',
    'suggestion.small.reduce_scope',
    'suggestion.small.keep_concise',
    'suggestion.testable.keep_gherkin',
    'suggestion.testable.add_gherkin',
    'overall.high',
    'overall.medium',
    'overall.low'
  ];

  const catalog = await loadToolPromptCatalog('user-story-analyzer');
  const missingKeys = requiredPromptKeys.filter((key) => !String(catalog[key] || '').trim());
  if (missingKeys.length > 0) {
    throw new Error(`Analyzer prompts are not configured for keys: ${missingKeys.join(', ')}`);
  }

  return catalog;
}

async function loadToolPromptCatalog(toolKey: string): Promise<AnalyzerPromptCatalog> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || (!serviceRoleKey && !anonKey)) {
    throw new Error('Prompt catalog access is not configured.');
  }

  const authToken = serviceRoleKey || anonKey || '';
  const query = new URLSearchParams({
    select: 'prompt_key,content,is_active',
    tool_key: `eq.${toolKey}`
  });

  const response = await fetch(`${supabaseUrl}/rest/v1/ai_tool_prompts?${query.toString()}`, {
    headers: {
      apikey: authToken,
      Authorization: `Bearer ${authToken}`,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error('Unable to load analyzer prompt catalog from Supabase.');
  }

  const rows = await response.json() as Array<{ prompt_key?: string; content?: string; is_active?: boolean }>;
  const catalog: AnalyzerPromptCatalog = {};
  rows.forEach((row) => {
    if (!row?.is_active) return;
    const key = String(row.prompt_key || '').trim();
    const content = String(row.content || '').trim();
    if (!key || !content) return;
    catalog[key] = content;
  });

  return catalog;
}
