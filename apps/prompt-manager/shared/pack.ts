import { fillVariables, fillPrompt, humanizeVariable } from './variables';
import type { VariableMeta } from './schema';

export interface PackItem { title: string; content: string; type: 'mandatory' | 'optional'; instructions?: string; description?: string; stepInstructions?: string; inputs?: VariableMeta[] }
export interface PackInput {
  projectName: string;
  subprojectName?: string;
  collectionName?: string;
  description?: string;
  items: PackItem[];
  values: Record<string, string>;
  generatedAt: Date;
}

const rule = '='.repeat(72);
const thin = '-'.repeat(72);

export function buildPackText(p: PackInput): string {
  const lines: string[] = [];
  lines.push(rule, 'PROMPT PACK', rule);
  lines.push(`Project: ${p.projectName}`);
  if (p.subprojectName) lines.push(`Subproject: ${p.subprojectName}`);
  if (p.collectionName) lines.push(`Collection: ${p.collectionName}`);
  if (p.description) lines.push(`Context: ${p.description}`);
  lines.push(`Prompts: ${p.items.length} (${p.items.filter((i) => i.type === 'mandatory').length} mandatory)`);
  const vars = Object.entries(p.values).filter(([, v]) => v.trim());
  if (vars.length) {
    lines.push('', 'Inputs:');
    for (const [k, v] of vars) lines.push(`  ${humanizeVariable(k)} = ${v}`);
  }
  lines.push(`Generated: ${p.generatedAt.toLocaleString()}`, rule, '');
  p.items.forEach((it, i) => {
    lines.push(`[${i + 1}/${p.items.length}] ${it.title} (${it.type === 'mandatory' ? 'Mandatory' : 'Optional'})`, thin);
    if (it.stepInstructions) lines.push(`Step instructions: ${fillVariables(it.stepInstructions, p.values)}`, '');
    lines.push(fillPrompt(it.content, it.inputs, p.values));
    if (it.instructions) lines.push('', `Additional instructions: ${fillVariables(it.instructions, p.values)}`);
    lines.push('', rule, '');
  });
  return lines.join('\n');
}

export function buildPackMarkdown(p: PackInput): string {
  const lines: string[] = [];
  lines.push(`# Prompt Pack — ${p.subprojectName ? `${p.projectName} / ${p.subprojectName}` : p.projectName}`, '');
  if (p.collectionName) lines.push(`**Collection:** ${p.collectionName}  `);
  if (p.description) lines.push(`**Context:** ${p.description}  `);
  lines.push(`**Prompts:** ${p.items.length} (${p.items.filter((i) => i.type === 'mandatory').length} mandatory)  `);
  lines.push(`**Generated:** ${p.generatedAt.toLocaleString()}`, '');
  const vars = Object.entries(p.values).filter(([, v]) => v.trim());
  if (vars.length) {
    lines.push('## Inputs', '', '| Input | Value |', '|---|---|');
    for (const [k, v] of vars) lines.push(`| ${humanizeVariable(k).replace(/\|/g, '\\|')} | ${v.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`);
    lines.push('');
  }
  p.items.forEach((it, i) => {
    lines.push('---', '', `## ${i + 1}. ${it.title}`, '', `*${it.type === 'mandatory' ? 'Mandatory' : 'Optional'}*`, '');
    if (it.stepInstructions) lines.push(`> ${fillVariables(it.stepInstructions, p.values).replace(/\n/g, '\n> ')}`, '');
    // Fenced so formatting, line breaks and special characters survive verbatim.
    const body = fillPrompt(it.content, it.inputs, p.values);
    const fence = body.includes('```') ? '~~~~' : '```';
    lines.push(fence + 'text', body, fence, '');
    if (it.instructions) lines.push(`**Additional instructions:** ${fillVariables(it.instructions, p.values)}`, '');
  });
  return lines.join('\n');
}
