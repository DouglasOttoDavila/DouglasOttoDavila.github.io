import candidates from './nvidia-models.json' with { type: 'json' };
export const DEFAULT_MODEL = candidates.find(model => model.verified && model.id === 'nvidia/nemotron-3-ultra-550b-a55b')?.id || candidates.find(model => model.verified)?.id || 'nvidia/nemotron-3-super-120b-a12b';
export const models = candidates.filter(model => model.verified);
export function assertModel(value: unknown): string {
 if (typeof value !== 'string' || !models.some(model => model.id === value)) throw new Error('Select a supported free NVIDIA chat model.');
 return value;
}
