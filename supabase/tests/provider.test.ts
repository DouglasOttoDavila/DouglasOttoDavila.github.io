import { providerConfig, generateGraphAnswer } from '../functions/operational-graph-assistant/provider.ts';
function assert(value: unknown, label: string) { if (!value) throw new Error(label); }
Deno.test('NVIDIA default uses server authorization and parses grounded JSON', async () => {
 const config = providerConfig(name => name === 'NVIDIA_API_KEY' ? 'test-secret' : undefined);
 assert(config.provider === 'nvidia' && config.model === 'nvidia/nemotron-3-ultra-550b-a55b', 'default model');
 const answer = await generateGraphAnswer(config, 'system', 'question', (async (url, options) => {
  assert(url === 'https://integrate.api.nvidia.com/v1/chat/completions', 'endpoint');
  assert(new Headers((options as {headers?: HeadersInit})?.headers).get('Authorization') === 'Bearer test-secret', 'server header');
  const body = JSON.parse(String((options as {body?: string})?.body)); assert(body.stream === false && body.chat_template_kwargs.enable_thinking === false, 'bounded non reasoning request');
  return Response.json({choices:[{message:{content:'```json\n{"answer":"Grounded","referencedNodeIds":[],"actions":[]}\n```'}}]});
 }) as typeof fetch);
 assert(answer.answer === 'Grounded', 'parse');
});
Deno.test('Missing credentials and invalid providers fail before dispatch', () => {
 for (const values of [{}, {GRAPH_ASSISTANT_PROVIDER:'invalid'}]) {
  let failed=false; try { providerConfig(name => (values as Record<string,string>)[name]); } catch { failed=true; } assert(failed, 'invalid config');
 }
});
Deno.test('Provider failures redact bodies and malformed answers fail closed', async () => {
 const config=providerConfig(name=>name==='NVIDIA_API_KEY'?'secret':undefined);
 for(const response of [new Response('private provider details',{status:401}),Response.json({choices:[{message:{content:'not JSON'}}]})]) {
  let error='';try{await generateGraphAnswer(config,'s','u',(async()=>response) as typeof fetch);}catch(e){error=(e as Error).message;}
  assert(error.includes('counted') && !error.includes('private provider details'),'sanitized failure');
 }
});
