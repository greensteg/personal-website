import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
  loader: glob({ pattern: '*.md', base: './content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.string(),
    id: z.number(),
    display: z.boolean().default(true),
    tags: z.string().optional()
  })
});

export const collections = { posts };
