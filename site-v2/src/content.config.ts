import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    kind: z.enum(['case-study', 'experiment', 'tool']),
    status: z.enum(['active', 'prototype', 'shipped']),
    year: z.number(),
    featured: z.boolean().default(false),
    skills: z.array(z.string()),
    signal: z.enum(['blue', 'teal', 'violet', 'amber']).default('blue'),
    externalUrl: z.url().optional(),
    labUrl: z.string().startsWith('/lab/').optional()
  })
});

const requiredText = z.string().trim().min(1);

const experience = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/experience' }),
  schema: z.object({
    sequence: z.number().int().positive(),
    role: requiredText,
    company: requiredText,
    location: requiredText,
    start: requiredText,
    end: requiredText,
    summary: requiredText,
    responsibilities: z.array(requiredText).min(1),
    outcomes: z.array(z.object({
      value: requiredText,
      label: requiredText,
      verified: z.literal(true)
    })).default([]),
    skills: z.array(requiredText).min(1),
    stage: z.enum(['foundation', 'automation', 'ai'])
  })
});

const writing = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/writing' }),
  schema: z.object({
    title: z.string(),
    excerpt: z.string(),
    publishedAt: z.coerce.date(),
    source: z.enum(['LinkedIn', 'Portfolio']),
    externalUrl: z.url(),
    topics: z.array(z.string()),
    featured: z.boolean().default(false)
  })
});

export const collections = { projects, experience, writing };
