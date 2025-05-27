'use server';
/**
 * @fileOverview A project summary AI agent.
 *
 * - generateProjectSummary - A function that handles the project summary generation process.
 * - GenerateProjectSummaryInput - The input type for the generateProjectSummary function.
 * - GenerateProjectSummaryOutput - The return type for the generateProjectSummary function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateProjectSummaryInputSchema = z.object({
  textDocumentContent: z
    .string()
    .describe('The content of the text document in the project.'),
  whiteboardContent: z
    .string()
    .describe('The content of the whiteboard in the project.'),
});
export type GenerateProjectSummaryInput = z.infer<typeof GenerateProjectSummaryInputSchema>;

const GenerateProjectSummaryOutputSchema = z.object({
  summary: z.string().describe('The AI-generated summary of the project.'),
});
export type GenerateProjectSummaryOutput = z.infer<typeof GenerateProjectSummaryOutputSchema>;

export async function generateProjectSummary(input: GenerateProjectSummaryInput): Promise<GenerateProjectSummaryOutput> {
  return generateProjectSummaryFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateProjectSummaryPrompt',
  input: {schema: GenerateProjectSummaryInputSchema},
  output: {schema: GenerateProjectSummaryOutputSchema},
  prompt: `You are an AI assistant that generates summaries for projects containing a text document and a whiteboard.

  Given the content of the text document and the whiteboard, create a concise summary of the project.

  Text Document Content: {{{textDocumentContent}}}
  Whiteboard Content: {{{whiteboardContent}}}
  `,
});

const generateProjectSummaryFlow = ai.defineFlow(
  {
    name: 'generateProjectSummaryFlow',
    inputSchema: GenerateProjectSummaryInputSchema,
    outputSchema: GenerateProjectSummaryOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
