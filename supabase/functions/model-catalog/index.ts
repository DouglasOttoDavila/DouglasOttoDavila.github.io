import { authenticatedUser, serviceRpc, readBody, jsonResponse, LabError } from '../_shared/lab.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { models, DEFAULT_MODEL, assertModel } from '../_shared/models.ts';
Deno.serve(async request => {
 if(request.method === 'OPTIONS') return new Response('ok',{headers:corsHeaders});
 if(request.method !== 'POST') return jsonResponse({error:'Method not allowed'},405);
 try {
  const body = await readBody(request, 2000);
  const {user}=await authenticatedUser(request);
  const status=await serviceRpc('lab_status',{p_user_id:user.id});
  if(status.access.state !== 'approved') throw new LabError('Approved Lab access required.',403);
  if(body.action === 'save') {
   const model=assertModel(body.model);
   await serviceRpc('lab_model_preference',{p_user_id:user.id,p_model:model});
  } else if(body.action !== 'list') throw new LabError('Unknown model action.',400);
  const preference=await serviceRpc('lab_model_preference',{p_user_id:user.id});
  return jsonResponse({models,defaultModel:models.some(model=>model.id===preference)?preference:DEFAULT_MODEL,unavailablePreference:preference && !models.some(model=>model.id===preference)?preference:null,checkedAt:'2026-09-14',source:'https://build.nvidia.com/models?filters=nimType%3Anim_type_preview'});
 }catch(error){return jsonResponse({error:(error as Error).message},error instanceof LabError?error.status:400);}
});
