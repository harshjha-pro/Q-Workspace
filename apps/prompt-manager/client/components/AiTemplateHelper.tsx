import { useState } from 'react';
import { Copy, Sparkles, ClipboardPaste } from 'lucide-react';
import { Button, Field, Textarea, Segmented } from './ui';
import { toast } from './overlay';
import { copyText } from '../lib/util';

const SIMPLE_COLS = ['Prompt Title', 'Prompt Content', 'Input 1 Title', 'Input 2 Title', 'Input 3 Title'];
const ADV_COLS = ['Prompt Title', 'Prompt Content', 'Prompt Type', 'Description', 'Tags', 'Collection', 'Sequence', 'Input 1 Title', 'Input 2 Title', 'Input 3 Title'];

export function buildAiTemplatePrompt(requirements: string, advanced: boolean, forLibrary: boolean): string {
  const cols = advanced ? ADV_COLS : SIMPLE_COLS;
  const example = advanced
    ? [
      '"Market Research","Conduct detailed market research for {Company name}. Cover market size, growth rate and the three most attractive customer segments. Present the result as a table followed by a short summary.","Mandatory","Market size and segments","research,market","Business Research","1","Company name","Industry","Region?"',
      '"Competitor Analysis","List the five most important competitors and compare their pricing, positioning and strengths in a table.","Optional","Competitor comparison","competitors","Business Research","2","Company name","Industry",""',
    ]
    : [
      '"Market Research","Conduct detailed market research for {Company name}. Cover market size, growth rate and the three most attractive customer segments. Present the result as a table followed by a short summary.","Company name","Industry","Region?"',
      '"Competitor Analysis","List the five most important competitors and compare their pricing, positioning and strengths in a table.","Company name","Industry",""',
    ];
  return [
    `You are an expert prompt engineer. Using my requirements below, write a set of high-quality, reusable AI prompts${forLibrary ? ' for my prompt template library' : ' for my project'} and return them as a CSV file I can import.`,
    '',
    'MY REQUIREMENTS:',
    '"""',
    requirements.trim() || '[Describe here what the prompts should help with: the goal, the audience, the kind of output you need and how many prompts you want.]',
    '"""',
    '',
    'OUTPUT RULES (follow exactly):',
    '1. Reply with ONLY the CSV inside a single ```csv code block. No text before or after it.',
    `2. The first line must be exactly this header:\n${cols.join(',')}`,
    '3. One prompt per row. Wrap every value in double quotes. Write a double quote inside a value as "". Line breaks inside a value are allowed (keep them inside the quotes).',
    '4. Prompt Title: short and descriptive (max 8 words), unique across rows.',
    '5. Prompt Content: the complete, ready-to-use prompt. Be specific about the task, the context, the expected output format and the quality bar.',
    '6. Inputs are the details the user must supply each time the prompt is used (for example: Company name, Industry, Target audience). Write each input title in its own "Input N Title" column. If a prompt needs more than three inputs, add more columns to the header (Input 4 Title, Input 5 Title, …). Leave unused input cells empty ("").',
    '7. To use an input inside the prompt text, write its exact title in curly braces, e.g. {Company name}. Inputs that are not written in the text are added automatically at the end of the prompt, so do not repeat them.',
    '8. Add ? at the end of an input title only if it is optional, e.g. "Region?".',
    '9. Use the same input titles (same spelling) across all prompts. Never use curly braces for anything other than inputs.',
    ...(advanced ? [
      '10. Prompt Type: "Mandatory" for prompts that must always be run, otherwise "Optional".',
      '11. Description: one short sentence. Tags: comma-separated keywords inside the quotes.',
      '12. Collection: a workflow name to group related prompts (leave empty if none). Sequence: 1, 2, 3… the order of the prompt inside its collection.',
    ] : []),
    '',
    'EXAMPLE OF THE EXACT FORMAT:',
    '```csv',
    cols.join(','),
    ...example,
    '```',
  ].join('\n');
}

/** "Fill the template with AI": the user describes what they need, copies a ready-made instruction to any AI chat, then pastes the answer back. */
export function AiTemplateHelper({ forLibrary, onPasteAnswer }: { forLibrary: boolean; onPasteAnswer?: () => void }) {
  const [req, setReq] = useState('');
  const [kind, setKind] = useState<'simple' | 'advanced'>('simple');
  const text = buildAiTemplatePrompt(req, kind === 'advanced', forLibrary);
  return (
    <div className="ai-helper col gap-12">
      <div className="row gap-8"><span className="icon-tile sm tone-green"><Sparkles /></span><div><div className="strong">Fill the template with AI</div><div className="small muted">Describe what you need, copy the instruction into ChatGPT, Claude or any AI, then paste its answer here.</div></div></div>
      <Field label="Your requirements" hint="E.g. “10 prompts to plan a product launch for a B2B SaaS company: research, positioning, pricing, launch plan and follow-up.”">
        <Textarea rows={3} value={req} onChange={(e) => setReq(e.target.value)} placeholder="What should the prompts help you do?" />
      </Field>
      <div className="row row-wrap gap-8">
        <Segmented label="Columns" value={kind} onChange={setKind} options={[{ value: 'simple', label: 'Simple' }, { value: 'advanced', label: 'Advanced' }]} />
        <Button variant="primary" size="sm" icon={<Copy />} onClick={async () => { await copyText(text); toast.success('AI instruction copied — paste it into your AI chat'); }}>Copy AI instruction</Button>
        {onPasteAnswer && <Button size="sm" icon={<ClipboardPaste />} onClick={onPasteAnswer}>Paste the AI answer</Button>}
      </div>
      <Field label="AI instruction (copy this into your AI chat)">
        <pre className="ai-helper-text" tabIndex={0}>{text}</pre>
      </Field>
    </div>
  );
}
