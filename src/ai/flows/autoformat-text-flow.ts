
'use server';
/**
 * @fileOverview An AI agent for auto-formatting text.
 *
 * - autoFormatText - A function that handles the text auto-formatting process.
 * - AutoFormatTextInput - The input type for the autoFormatText function.
 * - AutoFormatTextOutput - The return type for the autoFormatText function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AutoFormatTextInputSchema = z.object({
  textToFormat: z.string().describe('The text to be auto-formatted.'),
  userInstructions: z.string().optional().describe('Optional user instructions for formatting preferences.'),
});
export type AutoFormatTextInput = z.infer<typeof AutoFormatTextInputSchema>;

const AutoFormatTextOutputSchema = z.object({
  formattedText: z.string().describe('The AI-auto-formatted version of the text.'),
  explanation: z.string().optional().describe('An explanation of the formatting changes made by the AI.'),
});
export type AutoFormatTextOutput = z.infer<typeof AutoFormatTextOutputSchema>;

export async function autoFormatText(input: AutoFormatTextInput): Promise<AutoFormatTextOutput> {
  return autoFormatTextFlow(input);
}

const prompt = ai.definePrompt({
  name: 'autoFormatTextPrompt',
  input: {schema: AutoFormatTextInputSchema},
  output: {schema: AutoFormatTextOutputSchema},
  prompt: `You are an AI assistant that helps auto-format plain text for improved readability and structure.
Analyze the following text and apply common formatting conventions. This includes:
- Identifying and formatting headings (e.g., by making them title case and ensuring they are on their own line, possibly prefixed with '#' for Markdown style).
- Creating bullet points for lists (using '*' or '-' at the start of list items).
- Creating numbered lists where appropriate.
- Ensuring clear paragraph breaks.
- Applying bolding (e.g., \`**text**\`) or italics (e.g., \`*text*\`) for emphasis if it significantly improves clarity, but use sparingly.

{{#if userInstructions}}
Please also follow these specific instructions from the user: {{{userInstructions}}}
{{/if}}

Text to format:
{{{textToFormat}}}

Return the auto-formatted text. Also provide a brief explanation of the key formatting changes you made.
The output should be suitable to replace the original plain text in a textarea.
`,
});

const autoFormatTextFlow = ai.defineFlow(
  {
    name: 'autoFormatTextFlow',
    inputSchema: AutoFormatTextInputSchema,
    outputSchema: AutoFormatTextOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
