/* Declarative Slovak lessons. Body IDs are mapped by the simulation adapter. */
window.LearnContent = {
  topics: [
    { id: 'nasa-slnecna-sustava', title: 'Naša slnečná sústava', description: 'Spoznaj našu vesmírnu rodinu a pozri sa zblízka na Slnko a Zem.', minutes: 3 },
    { id: 'slnko', title: 'Slnko – naša hviezda', description: 'Preskúmaj svetlo zo Slnka a zisti, prečo sa na Zemi strieda deň a noc.', minutes: 4 },
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
  }, {
    id: 'slnko', title: 'Slnko – naša hviezda',
    objective: 'Zistíš, ako Slnko osvetľuje Zem a prečo jej otáčanie prináša deň a noc.',
    limitation: 'Model je názorný. Veľkosti, vzdialenosti a rýchlosti sú upravené. Sekundy animácie nepredstavujú skutočné hodiny ani dni.',
    sources: ['https://science.nasa.gov/sun/', 'https://spaceplace.nasa.gov/day-night/en/'],
    steps: [
      { id: 'uvod', type: 'intro', title: 'Odkiaľ prichádza denné svetlo?', text: 'Našu Zem osvetľuje Slnko. Spoločne preskúmame, prečo je niekde deň a inde noc.', next: 'Začať' },
      { id: 'hviezda', type: 'observe', title: 'Slnko – naša hviezda', text: 'Slnko je hviezda. Vydáva vlastné svetlo a energiu, ktoré dostáva aj Zem. Okolo Slnka obiehajú planéty.', demo: { kind: 'focus', body: 'sun' } },
      { id: 'den-noc', type: 'observe', title: 'Jedna Zem, deň aj noc', text: 'Slnko osvetľuje približne polovicu Zeme. Na strane obrátenej k Slnku je deň. Na opačnej strane je noc. Rozhranie medzi nimi vidíš aj v modeli.', demo: { kind: 'focus', body: 'earth', view: 'day-night' } },
      { id: 'pokus', type: 'experiment', title: 'Otoč Zem a sleduj miesto', text: 'Sleduj označené miesto. Tlačidlom otočíš Zem o štvrtinu otočky okolo jej osi. Miesto sa presúva medzi svetlom a tmou. Pohyb kamery prstom či myšou mení iba tvoj pohľad.', note: 'Obeh okolo Slnka sme na chvíľu zastavili. Otáčanie Zeme a jej obeh sú dva rôzne pohyby. Skutočný deň trvá približne 24 hodín; táto animácia nemeria skutočný čas.', demo: { kind: 'focus', body: 'earth', view: 'day-night' }, experiment: { kind: 'earth-day-night' } },
      { id: 'otazka', type: 'question', title: 'Prečo prichádza noc?', text: 'Prečo sa na Zemi strieda deň a noc?', options: [{ id: 'orbit', text: 'Pretože Zem obieha okolo Slnka.' }, { id: 'rotation', text: 'Pretože Zem sa otáča okolo svojej osi.' }, { id: 'sun-off', text: 'Pretože Slnko na noc prestane svietiť.' }], correct: 'rotation', correctFeedback: 'Správne! Zem sa otáča okolo svojej osi. Naše miesto sa tak obracia k slnečnému svetlu a potom od neho.', incorrectFeedback: 'Skús to znova. Slnko svieti stále. Deň a noc sa striedajú preto, že Zem sa otáča okolo svojej osi, nie pre jej obeh okolo Slnka.' },
      { id: 'zaver', type: 'summary', title: 'Už vieš, prečo sa strieda deň a noc!', ideas: ['Slnko je hviezda a dáva Zemi svetlo a energiu.', 'Zem sa otáča okolo svojej osi. Miesta na povrchu sa obracajú k svetlu a od neho – strieda sa deň a noc.', 'Otáčanie okolo osi a obeh okolo Slnka sú rôzne pohyby.'], text: 'Pokračuj v objavovaní alebo si vyskúšaj kvíz o všetkých ôsmich planétach.' }
    ]
  }]
};
