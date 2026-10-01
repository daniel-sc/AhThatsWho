import { generate, PARSER_MODEL } from './openai';
import { fixtures } from '../domain/fixtures';
import { now, uuid, type Capture } from '../domain/types';
export async function evaluateParser() {
  const b = fixtures(2);
  b.households[0].household.people[0].firstName = { value: 'Matias' };
  b.households[1].household.people[0].firstName = { value: 'Matias' };
  const cases = [
    {
      text: 'Im Haushalt Example 1: Matias wird Matthias geschrieben. Sonst bleibt alles unverändert.',
      check: (p: Awaited<ReturnType<typeof generate>>[number]) =>
        p.action === 'update' &&
        p.targetId === 'synthetic-0' &&
        p.household?.people[0].id === 'synthetic-person-0' &&
        p.household.people[0].firstName?.value === 'Matthias' &&
        p.household.people.length === 2 &&
        p.household.notes === b.households[0].household.notes,
    },
    {
      text: 'Robin 1 im Haushalt Example 1 hat am 12. April Geburtstag. Das Jahr kenne ich nicht.',
      check: (p: Awaited<ReturnType<typeof generate>>[number]) =>
        p.action === 'update' &&
        p.targetId === 'synthetic-0' &&
        p.household?.people[1].birthDate?.value.kind === 'month-day' &&
        p.household.people[1].birthDate.value.month === 4 &&
        p.household.people[1].birthDate.value.day === 12,
    },
    {
      text: 'Matias hat einen Hund namens Keks.',
      check: (p: Awaited<ReturnType<typeof generate>>[number]) => p.action === 'ambiguous',
    },
  ];
  const results = [];
  for (const test of cases) {
    const c: Capture = {
      id: uuid(),
      createdAt: now(),
      updatedAt: now(),
      kind: 'text',
      text: test.text,
      hints: {},
      stage: 'source-ready',
    };
    const drafts = await generate(c, b.households, b.contexts);
    results.push({
      passed: drafts.length === 1 && !!test.check(drafts[0]),
      action: drafts[0].action,
    });
  }
  return { model: PARSER_MODEL, at: now(), results, passed: results.every((r) => r.passed) };
}
