// Synthetic only. Run with a personal API key; never read the user's notebook.
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { responseBody, PARSER_MODEL, type GenerationMode } from '../src/providers/openai-contract';
import { fixtures } from '../src/domain/fixtures';
import type { Proposal } from '../src/domain/types';

const baselineRef =
  process.argv.slice(2).find((arg) => !arg.startsWith('--')) ||
  'ae9151fb4bce6faa8226d8a64f3ba9fcd30a349a';
const dryRun = process.argv.includes('--dry-run');
const repeats = 3;
const notebook = fixtures(2);
const [first, second] = notebook.households;
first.household.people[0].firstName = { value: 'Matias' };
second.household.people[0].firstName = { value: 'Matias' };
const sourceInput = (source: string) => ({
  source,
  expectedLanguages: ['de'],
  hints: {},
  candidates: notebook.households,
  contexts: notebook.contexts,
  nameIndex: notebook.households.map((r) => ({
    id: r.household.id,
    names: r.household.people.map((p) =>
      [p.firstName?.value, p.lastName?.value].filter(Boolean).join(' '),
    ),
  })),
});
type Case = {
  name: string;
  source: string;
  multiple?: boolean;
  check: (drafts: Proposal[]) => string[];
};
const names = (p: Proposal | undefined) =>
  p?.household?.people.map((x) => x.firstName?.value) || [];
const checkUpdate = (drafts: Proposal[]) => {
  const errors: string[] = [];
  if (drafts.length !== 1) errors.push('Wrong household count');
  if (drafts[0]?.action !== 'update' || drafts[0]?.targetId !== first.household.id)
    errors.push('Wrong existing target/action');
  return errors;
};
const cases: Case[] = [
  {
    name: 'spelling-and-preservation',
    source:
      'Im Haushalt Example 1: Matias wird Matthias geschrieben. Sonst bleibt alles unverändert.',
    check: (drafts) => [
      ...checkUpdate(drafts),
      ...(names(drafts[0])[0] === 'Matthias' ? [] : ['Spelling correction omitted']),
      ...(drafts[0]?.household?.people.length === 2 &&
      drafts[0]?.household?.people[1].id === first.household.people[1].id &&
      drafts[0]?.household?.notes === first.household.notes
        ? []
        : ['Untouched people/facts changed']),
    ],
  },
  {
    name: 'partial-date',
    source: 'Robin 1 im Haushalt Example 1 hat am 12. April Geburtstag. Das Jahr kenne ich nicht.',
    check: (drafts) => {
      const date = drafts[0]?.household?.people.find((p) => p.id === first.household.people[1].id)
        ?.birthDate?.value;
      return [
        ...checkUpdate(drafts),
        ...(date?.kind === 'month-day' && date.month === 4 && date.day === 12
          ? []
          : ['Date lost or invented precision']),
      ];
    },
  },
  {
    name: 'ambiguous-existing-name',
    source: 'Matias hat einen Hund namens Keks.',
    check: (drafts) =>
      drafts.length === 1 && drafts[0].action === 'ambiguous'
        ? []
        : ['Ambiguous identity resolved without evidence'],
  },
  {
    name: 'single-household-list',
    source: 'Neuer Haushalt: Lukas und Miriam, mit Felix und Clara.',
    check: (drafts) => [
      ...(drafts.length === 1 && drafts[0].action === 'create'
        ? []
        : ['Unnecessary split or wrong action']),
      ...(['Lukas', 'Miriam', 'Felix', 'Clara'].every((name) => names(drafts[0]).includes(name))
        ? []
        : ['Captured person omitted']),
      ...(drafts[0]?.household?.people.map((p) => p.role).join(',') === 'adult,adult,child,child'
        ? []
        : ['Household shorthand changed']),
    ],
  },
  {
    name: 'incidental-other-household',
    source:
      'Nur Haushalt Example 1 aktualisieren: Matias spielt jetzt Tennis. Seinen Nachbarn kenne ich noch nicht, bitte keinen weiteren Haushalt anlegen.',
    check: checkUpdate,
  },
  {
    name: 'mixed-create-update',
    multiple: true,
    source:
      'Im Haushalt Example 1: Matias wird Matthias geschrieben. Separater neuer Haushalt: Nora und Peter.',
    check: (drafts) => {
      const updated = drafts.find((p) => p.targetId === first.household.id);
      const created = drafts.find((p) => p.action === 'create');
      return [
        ...(drafts.length === 2 ? [] : ['Wrong household count']),
        ...(updated?.action === 'update' && names(updated)[0] === 'Matthias'
          ? []
          : ['Wrong update or omitted correction']),
        ...(names(created).length === 2 &&
        ['Nora', 'Peter'].every((name) => names(created).includes(name))
          ? []
          : ['Wrong assignment or omitted person']),
        ...(names(updated).includes('Nora') || names(updated).includes('Peter')
          ? ['New people leaked into existing household']
          : []),
      ];
    },
  },
  {
    name: 'fact-attribution',
    multiple: true,
    source:
      'Zwei neue Haushalte: Nora, Geburtstag 12. April, mit Peter. Separat Amira, Geburtstag 3. Juni, mit Jonas.',
    check: (drafts) => {
      const errors =
        drafts.length === 2 && drafts.every((p) => p.action === 'create')
          ? []
          : ['Wrong count or actions'];
      for (const [name, partner, day, month] of [
        ['Nora', 'Peter', 12, 4],
        ['Amira', 'Jonas', 3, 6],
      ] as const) {
        const draft = drafts.find((p) => names(p).includes(name));
        const date = draft?.household?.people.find((p) => p.firstName?.value === name)?.birthDate
          ?.value;
        if (!names(draft).includes(partner) || names(draft).length !== 2)
          errors.push(`Wrong grouping for ${name}`);
        if (date?.kind !== 'month-day' || date.month !== month || date.day !== day)
          errors.push(`Wrong or missing birthday for ${name}`);
      }
      return errors;
    },
  },
  {
    name: 'unclear-boundaries',
    multiple: true,
    source:
      'Zwei neue Haushalte aus dem Schwimmkurs: Anna, Ben, Clara, David. Ich weiß nicht mehr, wer zusammengehört.',
    check: (drafts) => {
      const captured = drafts.flatMap(names).sort();
      return [
        ...(drafts.length >= 2 && drafts.every((p) => p.action === 'create')
          ? []
          : ['No multiple-household guess']),
        ...(captured.join(',') === 'Anna,Ben,Clara,David'
          ? []
          : ['Invented, duplicated, or omitted person']),
        ...(/unsicher|unklar|vermut|angenomm|uncertain|guess|unclear|assum/i.test(
          drafts.map((p) => p.reason).join(' '),
        )
          ? []
          : ['Grouping uncertainty not explained']),
      ];
    },
  },
];
const baselineSource = execFileSync(
  'git',
  ['show', `${baselineRef}:src/providers/openai-contract.ts`],
  { encoding: 'utf8' },
);
const baseline = (await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(baselineSource)).toString('base64')}`
)) as { responseBody: typeof responseBody };
const planned = cases.flatMap((test) =>
  (test.multiple
    ? ['multiple-auto-low', 'multiple-low', 'multiple-medium']
    : ['baseline-low', 'current-low']
  ).map((variant) => ({ test, variant })),
);
if (dryRun) {
  console.log(
    JSON.stringify(
      {
        baselineRef,
        model: PARSER_MODEL,
        repeats,
        requests: planned.length * repeats,
        cases: cases.map(({ name, multiple }) => ({
          name,
          cohort: multiple ? 'multiple' : 'existing',
        })),
      },
      null,
      2,
    ),
  );
} else {
  const key = process.env.OPENAI_API_KEY;
  if (!key)
    throw new Error('Set OPENAI_API_KEY to run the synthetic comparison, or use --dry-run.');
  const results: {
    case: string;
    variant: string;
    run: number;
    errors: string[];
    durationMs: number;
    usage: unknown;
    drafts: Proposal[];
  }[] = [];
  for (const { test, variant } of planned)
    for (let run = 1; run <= repeats; run++) {
      const mode: GenerationMode =
        test.multiple && variant !== 'multiple-auto-low' ? 'multiple' : 'auto';
      const body = (variant === 'baseline-low' ? baseline.responseBody : responseBody)(
        sourceInput(test.source),
        mode,
      );
      body.reasoning.effort = variant === 'multiple-medium' ? 'medium' : 'low';
      const start = performance.now();
      const reply = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      });
      if (!reply.ok)
        throw new Error(
          `Evaluation stopped: OpenAI HTTP ${reply.status}. Completed results were printed as JSON lines.`,
        );
      const response = await reply.json();
      const raw = response.output
        ?.flatMap((o: { content?: { type: string; text?: string }[] }) => o.content || [])
        .filter((x: { type: string }) => x.type === 'output_text')
        .map((x: { text: string }) => x.text)
        .join('');
      let errors: string[],
        drafts: Proposal[] = [];
      try {
        if (response.status !== 'completed') throw new Error('Incomplete response');
        const parsed = JSON.parse(raw);
        drafts = variant === 'baseline-low' ? [parsed] : parsed.proposals;
        errors = test.check(drafts);
      } catch {
        errors = ['Incomplete or unusable output'];
      }
      const result = {
        case: test.name,
        variant,
        run,
        errors,
        durationMs: Math.round(performance.now() - start),
        usage: response.usage,
        drafts,
      };
      results.push(result);
      console.log(JSON.stringify(result));
    }
  console.log(
    JSON.stringify({
      summary: [...new Set(results.map((r) => r.variant))].map((variant) => {
        const rows = results.filter((r) => r.variant === variant);
        return {
          variant,
          runs: rows.length,
          passing: rows.filter((r) => !r.errors.length).length,
          flaggedIssues: rows.reduce((n, r) => n + r.errors.length, 0),
          meanDurationMs: Math.round(rows.reduce((n, r) => n + r.durationMs, 0) / rows.length),
        };
      }),
      note: 'Flagged issues are a correction-effort proxy. Inspect drafts for unscored errors; actual user correction time and a unique correct split for unclear boundaries are not measured.',
    }),
  );
}
