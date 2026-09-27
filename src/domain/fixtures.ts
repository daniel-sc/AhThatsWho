import { FORMAT_VERSION, type Backup } from './types';
export function fixtures(count = 500): Backup {
  const at = '2026-09-27T12:00:00.000Z';
  const names = [
    'Elena',
    'Jonas',
    'Ruben',
    'Amelie',
    'Clara',
    'David',
    'Nora',
    'Felix',
    'Matthias',
    'Zoë',
    'Özlem',
    'Béla',
  ];
  return {
    format: 'namecue',
    version: FORMAT_VERSION,
    exportedAt: at,
    contexts: [
      { id: 'school', name: 'School', favorite: true },
      { id: 'garden', name: 'Garden club', favorite: true },
      { id: 'work', name: 'Work', favorite: true },
    ],
    households: Array.from({ length: count }, (_, i) => ({
      household: {
        id: `synthetic-${i}`,
        people: [
          {
            id: `synthetic-person-${i}`,
            firstName: { value: names[i % names.length] },
            lastName: { value: `Example ${i + 1}` },
            role: 'adult' as const,
          },
          {
            id: `synthetic-child-${i}`,
            firstName: { value: `Robin ${i + 1}` },
            role: 'child' as const,
          },
        ],
        contextIds: [['school', 'garden', 'work'][i % 3]],
        cue: ['Blue cargo bike', 'Community vegetable garden', 'Met at the summer picnic'][i % 3],
        notes: `Synthetic household ${i + 1}. Enjoys pottery and hiking.`,
      },
      versionId: `synthetic-version-${i}`,
      createdAt: at,
      updatedAt: new Date(Date.parse(at) - i * 1000).toISOString(),
      source: { kind: 'manual' as const },
    })),
    revisions: [],
    inbox: [],
    preferences: { resume: true },
  };
}
