import { corsHeaders } from '../_shared/cors.ts';

type SupabaseAuthUser = {
  id?: string;
  email?: string;
};

type AnalyzerRequestPayload = {
  story_content?: string;
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
    // Local deterministic analysis mode (no external webhook dependency).
    const localAnalysis = buildLocalAnalysis(storyContent);
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

function buildLocalAnalysis(storyContent: string): Record<string, unknown> {
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
  if (!hasActor) missing.push('The user/persona is not explicit.');
  if (!hasWant) missing.push('The user intent ("I want ...") is not explicit.');
  if (!hasBenefit) missing.push('The business or user value ("so that ...") is missing.');
  if (!hasGivenWhenThen) missing.push('Acceptance criteria in Given/When/Then format are missing.');
  if (!hasEstimateSignals) missing.push('No measurable thresholds (time, quantity, accuracy) were identified.');

  const actor = safeText(actorMatch?.[1]) || 'user';
  const desiredOutcome = safeText(wantMatch?.[1]) || 'achieve the intended outcome';
  const benefit = safeText(benefitMatch?.[1]) || 'I can deliver value with clear outcomes';

  const rewrittenStory = `As a ${actor}, I want to ${desiredOutcome} so that ${benefit}.`;
  const gherkinAcceptanceCriteria = [
    'Given I am an authenticated and approved user,',
    `When I ${desiredOutcome},`,
    'Then the expected result is completed within defined measurable thresholds.'
  ].join('\n');

  const overallComment = createOverallComment({
    independent,
    negotiable,
    valuable,
    estimable,
    small,
    testable
  });

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
          ? 'Split the story into one primary outcome. Move secondary outcomes into separate stories.'
          : 'Keep the story focused on one outcome and avoid bundling unrelated behaviors.',
        negotiableSuggestion: hasAmbiguousWords
          ? 'Replace vague terms like "fast" or "better" with explicit constraints.'
          : 'Keep room for implementation discussion by describing outcomes instead of technical design.',
        valuableSuggestion: hasBenefit
          ? 'Retain the value statement and tie it to a measurable product or user impact.'
          : 'Add a "so that" clause describing customer or business value.',
        estimableSuggestion: hasEstimateSignals
          ? 'Good start on measurable expectations. Add clear scope boundaries for effort estimation.'
          : 'Include measurable targets (time, volume, quality) so the effort can be estimated confidently.',
        smallSuggestion: length > 500 || hasAnd
          ? 'Reduce scope to one thin vertical slice that can be delivered and validated quickly.'
          : 'Scope appears manageable. Keep acceptance criteria concise and focused.',
        testableSuggestion: hasGivenWhenThen
          ? 'Keep Given/When/Then criteria tied to pass/fail conditions and edge cases.'
          : 'Add at least one Given/When/Then acceptance criterion with measurable expected results.',
        rewrittenStory,
        gherkinAcceptanceCriteria,
        missingContextOrDependencies: missing.length
          ? missing.join(' ')
          : 'No major context gaps detected from the provided text.',
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
}): string {
  const average = (
    scores.independent
    + scores.negotiable
    + scores.valuable
    + scores.estimable
    + scores.small
    + scores.testable
  ) / 6;

  if (average >= 4.5) {
    return 'Strong INVEST quality. Minor refinements to acceptance criteria can further improve delivery confidence.';
  }
  if (average >= 3.5) {
    return 'Moderate INVEST quality. Clarify measurable outcomes and tighten scope to improve implementation confidence.';
  }
  return 'Low INVEST quality. Rewrite the story with clear value, measurable criteria, and narrower scope.';
}

function clampScore(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value)));
}

function safeText(value: string | undefined): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
