
import { config } from 'dotenv';
config();

import '@/ai/flows/suggest-text-improvements.ts';
import '@/ai/flows/generate-project-summary.ts';
import '@/ai/flows/autoformat-text-flow.ts'; // Added new flow
