// src/ai/flows/suggest-text-improvements.ts
'use server';

/**
 * @fileOverview AI-powered text improvement suggestions.
 *
 * - suggestTextImprovements - A function that provides suggestions for improving text clarity, grammar, and style.
 * - SuggestTextImprovementsInput - The input type for the suggestTextImprovements function.
 * - SuggestTextImprovementsOutput - The return type for the suggestTextImprovements function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestTextImprovementsInputSchema = z.object({
  selectedText: z
    .string()
    .describe('The text selected by the user to be improved.'),
  userPrompt: z
    .string()
    .optional()
    .describe(
      'Optional user prompt providing specific instructions for the text improvement.'
    ),
});
export type SuggestTextImprovementsInput = z.infer<
  typeof SuggestTextImprovementsInputSchema
>;

const SuggestTextImprovementsOutputSchema = z.object({
  improvedText: z
    .string()
    .describe('The AI-suggested improved version of the text.'),
  explanation: z
    .string()
    .optional()
    .describe('An explanation of the changes made by the AI.'),
});
export type SuggestTextImprovementsOutput = z.infer<
  typeof SuggestTextImprovementsOutputSchema
>;

export async function suggestTextImprovements(
  input: SuggestTextImprovementsInput
): Promise<SuggestTextImprovementsOutput> {
  return suggestTextImprovementsFlow(input);
}

const suggestTextImprovementsPrompt = ai.definePrompt({
  name: 'suggestTextImprovementsPrompt',
  input: {schema: SuggestTextImprovementsInputSchema},
  output: {schema: SuggestTextImprovementsOutputSchema},
  prompt: `You are an AI text improvement assistant.  You will be given a section of text and your job is to improve the text for clarity, grammar, and style. 

Selected Text: {{{selectedText}}}

{% if userPrompt %}Specific instructions from the user: {{{userPrompt}}}{% endif %}

Please provide the improved text, and a brief explanation of the changes you made.  The response should be suitable to show directly to the user.
`,
});

const suggestTextImprovementsFlow = ai.defineFlow(
  {
    name: 'suggestTextImprovementsFlow',
    inputSchema: SuggestTextImprovementsInputSchema,
    outputSchema: SuggestTextImprovementsOutputSchema,
  },
  async input => {
    const {output} = await suggestTextImprovementsPrompt(input);
    return output!;
  }
);
