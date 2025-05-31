
'use server';
/**
 * @fileOverview An AI agent for answering user queries and generating text.
 *
 * - askAi - A function that handles user queries.
 * - AskAiInput - The input type for the askAi function.
 * - AskAiOutput - The return type for the askAi function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AskAiInputSchema = z.object({
  userQuery: z.string().describe('The user_s question or request for text generation.'),
});
export type AskAiInput = z.infer<typeof AskAiInputSchema>;

const AskAiOutputSchema = z.object({
  aiResponse: z.string().describe('The AI-generated text in response to the user_s query.'),
  explanation: z.string().optional().describe('An optional explanation of how the AI arrived at the answer or any assumptions made.'),
});
export type AskAiOutput = z.infer<typeof AskAiOutputSchema>;

export async function askAi(input: AskAiInput): Promise<AskAiOutput> {
  return askAiFlow(input);
}

const prompt = ai.definePrompt({
  name: 'askAiPrompt',
  input: {schema: AskAiInputSchema},
  output: {schema: AskAiOutputSchema},
  prompt: `You are a helpful AI assistant. The user has provided the following query or request:

"{{{userQuery}}}"

Please generate a concise and relevant text response.
If the request is to write something (e.g., "write a short note about X"), focus on fulfilling that request.
If the request is a question, provide a clear answer.
You can also provide a brief explanation of your response if it adds clarity or if you made specific assumptions.
The primary output should be the generated text itself.
`,
});

const askAiFlow = ai.defineFlow(
  {
    name: 'askAiFlow',
    inputSchema: AskAiInputSchema,
    outputSchema: AskAiOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
