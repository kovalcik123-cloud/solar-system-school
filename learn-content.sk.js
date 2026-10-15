/* Declarative Slovak lessons. Body IDs are mapped by the simulation adapter. */
window.LearnContent = {
  topics: [
    { id: 'nasa-slnecna-sustava', title: 'Naša slnečná sústava', description: 'Spoznaj našu vesmírnu rodinu a pozri sa zblízka na Slnko a Zem.', minutes: 3 },
    { id: 'slnko', title: 'Slnko – naša hviezda' },
    { id: 'planety', title: 'Spoznaj planéty' },
    { id: 'zem-mesiac', title: 'Zem a Mesiac' },
    { id: 'pohyb', title: 'Pohyb vo vesmíre' },
    { id: 'obri', title: 'Vesmírni obri' }
  ],
  lessons: [{
    id: 'nasa-slnecna-sustava', title: 'Naša slnečná sústava',
    objective: 'Rozlíšiš Slnko od planét a spoznáš miesto našej Zeme.',
    limitation: 'Model je názorný. Veľkosti telies, vzdialenosti a rýchlosti pohybu nie sú v spoločnej mierke.',
    sources: ['https://science.nasa.gov/solar-system/'],
    steps: [
      { id: 'uvod', type: 'intro', title: 'Vitaj v slnečnej sústave', text: 'Slnečnú sústavu tvorí Slnko, osem planét a ďalšie telesá, napríklad mesiace a kométy.', next: 'Začať' },
      { id: 'sustava', type: 'observe', title: 'Pozrime sa na celú sústavu', text: 'Planéty obiehajú okolo Slnka. Pozoruj ich pohyb. V tomto modeli sú vzdialenosti aj veľkosti upravené, aby sme mohli sústavu lepšie preskúmať.', demo: { kind: 'overview' } },
      { id: 'slnko', type: 'observe', title: 'Slnko je hviezda', text: 'Slnko je hviezda. Dáva Zemi svetlo a energiu. Okolo Slnka obieha všetkých osem planét.', demo: { kind: 'focus', body: 'sun' } },
      { id: 'zem', type: 'observe', title: 'Naša planéta Zem', text: 'Zem je jednou z ôsmich planét. Obieha okolo Slnka a na jej povrchu je kvapalná voda. Môžeš si ju otočiť a priblížiť. Keď ju preskúmaš, pokračuj ďalej.', demo: { kind: 'focus', body: 'earth' }, next: 'Pokračovať' },
      { id: 'otazka', type: 'question', title: 'Čo si si zapamätal?', text: 'Ktoré z týchto telies je hviezda?', options: [{ id: 'earth', text: 'Zem' }, { id: 'sun', text: 'Slnko' }, { id: 'jupiter', text: 'Jupiter' }], correct: 'sun', correctFeedback: 'Správne! Slnko je hviezda. Vydáva vlastné svetlo a energiu. Zem a Jupiter sú planéty.', incorrectFeedback: 'Skús to znova. Hviezdou je Slnko – vydáva vlastné svetlo a energiu. Zem a Jupiter sú planéty.' },
      { id: 'zaver', type: 'summary', title: 'Výborne! Spoznal si slnečnú sústavu.', ideas: ['Slnko je hviezda.', 'Okolo Slnka obieha osem planét.', 'Zem je jednou z týchto planét.'], text: 'Kvíz obsahuje otázky o všetkých ôsmich planétach, nielen o tejto lekcii.' }
    ]
  }]
};
