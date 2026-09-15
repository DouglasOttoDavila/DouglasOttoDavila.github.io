import { assertModel, DEFAULT_MODEL, models } from '../functions/_shared/models.ts';
function assert(value: unknown,label:string){if(!value)throw Error(label);}
Deno.test('Only verified catalog models are accepted',()=>{
 assert(models.length>0,'catalog populated');assert(models.some(model=>model.id===DEFAULT_MODEL),'default selectable');
 for(const model of models)assert(assertModel(model.id)===model.id,'known model accepted');
 for(const value of ['https://untrusted.example/model','paid/model',null,42]){let failed=false;try{assertModel(value);}catch{failed=true;}assert(failed,'arbitrary model rejected');}
});
