/* Declarative Slovak lessons. Body IDs are mapped by the simulation adapter. */
window.LearnContent = {
  topics: [
    { id: 'nasa-slnecna-sustava', title: 'Naša slnečná sústava', description: 'Spoznaj našu vesmírnu rodinu a pozri sa zblízka na Slnko a Zem.', minutes: 3 },
    { id: 'slnko', title: 'Slnko – naša hviezda', description: 'Preskúmaj svetlo zo Slnka a zisti, prečo sa na Zemi strieda deň a noc.', minutes: 4 },
    { id: 'planety', title: 'Spoznaj planéty', description: 'Vydaj sa na expedíciu ku všetkým ôsmim planétam a zisti, čím sa od seba líšia.', minutes: 9 },
    { id: 'zem-mesiac', title: 'Zem a Mesiac' },
    { id: 'pohyb', title: 'Pohyb vo vesmíre' },
    { id: 'obri', title: 'Vesmírni obri' }
  ],
  // Scientific classification for lesson content; independent of rendering material types.
  planetGroups: [
    { id: 'terrestrial', title: 'Kamenné planéty', label: 'Kamenná planéta', bodies: ['mercury', 'venus', 'earth', 'mars'] },
    { id: 'gas-giant', title: 'Plynní obri', label: 'Plynný obor', bodies: ['jupiter', 'saturn'] },
    { id: 'ice-giant', title: 'Ľadoví obri', label: 'Ľadový obor', bodies: ['uranus', 'neptune'] }
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
  }, {
    id: 'planety', title: 'Spoznaj planéty',
    objective: 'Spoznáš všetkých osem planét a rozlíšiš kamenné planéty, plynných obrov a ľadových obrov.',
    limitation: 'Model je názorný. Veľkosti planét, vzdialenosti a rýchlosti nie sú v spoločnej mierke – obri sú v skutočnosti oveľa väčší, ako ich tu vidíš. Model nezobrazuje sklon osí planét ani všetky ich mesiace.',
    sources: ['https://science.nasa.gov/solar-system/planets/'],
    steps: [
      { id: 'uvod', type: 'intro', title: 'Vesmírna expedícia sa začína!', text: 'Navštívime všetkých osem planét slnečnej sústavy. Začneme pri Merkúri, ktorý je najbližšie k Slnku, a skončíme pri vzdialenom Neptúne.', next: 'Štart expedície' },
      { id: 'prehlad', type: 'observe', title: 'Osem planét okolo Slnka', text: 'Planéty obiehajú okolo Slnka v tomto poradí: Merkúr, Venuša, Zem, Mars, Jupiter, Saturn, Urán a Neptún. Prvé štyri sú menšie kamenné planéty blízko Slnka. Za nimi obiehajú štyria obri.', demo: { kind: 'overview' } },
      { id: 'vnutorne', type: 'tour', title: 'Kamenné planéty', group: 'terrestrial', stops: [
        { body: 'mercury', title: 'Merkúr', text: 'Merkúr je najmenšia planéta a obieha najbližšie k Slnku. Takmer nemá atmosféru, ktorá by ho prikryla ako perina.', fact: 'Cez deň sa jeho povrch rozpáli asi na 430 °C, no v noci teplota klesne až na −180 °C.' },
        { body: 'venus', title: 'Venuša', text: 'Venuša je takmer taká veľká ako Zem. Obaľuje ju hustá atmosféra z oxidu uhličitého a hrubé oblaky, ktoré zadržiavajú teplo.', fact: 'Je to najhorúcejšia planéta – asi 465 °C. Je horúcejšia ako Merkúr, hoci je od Slnka ďalej.' },
        { body: 'earth', title: 'Zem', text: 'Zem je náš domov. Je to jediná planéta, o ktorej vieme, že na nej žijú rastliny, zvieratá a ľudia. Na jej povrchu je kvapalná voda.', fact: 'Približne 70 % povrchu Zeme pokrýva voda.' },
        { body: 'mars', title: 'Mars', text: 'Mars sa volá Červená planéta. Jeho povrch pokrýva prach a kamene so zhrdzaveným železom, preto je červenkastý.', fact: 'Je tu Olympus Mons, najvyššia známa sopka v slnečnej sústave. Je asi 2,5-krát vyššia ako Mount Everest.', note: 'Mars má dva malé mesiace. V modeli vidíš iba jeden z nich.' }
      ] },
      { id: 'vonkajsie', type: 'tour', title: 'Obri slnečnej sústavy', next: 'Roztrieď planéty', nextShort: 'Roztrieď →', stops: [
        { body: 'jupiter', title: 'Jupiter', text: 'Jupiter je najväčšia planéta. Je to plynný obor – tvorí ho najmä vodík a hélium a nemá pevný povrch, na ktorý by sa dalo pristáť.', fact: 'Veľká červená škvrna na Jupiteri je obrovská búrka, ktorá je väčšia ako celá Zem.', note: 'V modeli je Jupiter zmenšený. Má veľa mesiacov, no vidíš iba jeden – Európu.' },
        { body: 'saturn', title: 'Saturn', text: 'Saturn je druhá najväčšia planéta a tiež plynný obor. Je známy svojimi nádhernými prstencami.', fact: 'Prstence tvoria nespočetné kúsky ľadu a kameňa. Prstence majú aj Jupiter, Urán a Neptún, no sú oveľa slabšie.', note: 'Saturn má veľa mesiacov. Model ich nezobrazuje.' },
        { body: 'uranus', title: 'Urán', text: 'Urán je ľadový obor. Pod atmosférou ukrýva veľa vody, čpavku a metánu – vedci tieto látky nazývajú ľady. Metán mu dáva modrozelenú farbu.', fact: 'Urán je naklonený takmer na bok. Okolo Slnka sa pohybuje, akoby sa kotúľal.', note: 'Tento veľký sklon v našom modeli neuvidíš.' },
        { body: 'neptune', title: 'Neptún', text: 'Neptún je ľadový obor a najvzdialenejšia planéta od Slnka. Jeden obeh okolo Slnka mu trvá asi 165 rokov.', fact: 'Fúkajú tu najsilnejšie vetry v slnečnej sústave – rýchlejšie ako 2 000 km/h.' }
      ] },
      // Deterministic mixed order; answers are checked against planetGroups.
      { id: 'triedenie', type: 'classify', title: 'Roztrieď planéty', next: 'Prejsť na otázky',
        doneTitle: 'Planéty sú roztriedené!', doneText: 'Štyri kamenné planéty obiehajú blízko Slnka. Za nimi sú dvaja plynní obri a dvaja ľadoví obri.',
        groups: [{ id: 'terrestrial', label: 'Kamenná planéta' }, { id: 'gas-giant', label: 'Plynný obor' }, { id: 'ice-giant', label: 'Ľadový obor' }],
        items: [
          { body: 'mars', group: 'terrestrial', hint: 'Má Mars pevný povrch, po ktorom by sa dalo prechádzať? Je to malá planéta blízko Slnka, alebo obor?', confirm: 'Správne! Mars je kamenná planéta – má pevný, kamenistý povrch.' },
          { body: 'saturn', group: 'gas-giant', hint: 'Saturn je druhá najväčšia planéta a nemá pevný povrch. Pamätáš si, či ho tvoria najmä plyny, alebo ľady?', confirm: 'Správne! Saturn je plynný obor – tvorí ho najmä vodík a hélium.' },
          { body: 'neptune', group: 'ice-giant', hint: 'Neptún je najďalej od Slnka a pod atmosférou ukrýva veľa vody, čpavku a metánu. Ako vedci nazývajú tieto látky?', confirm: 'Správne! Neptún je ľadový obor.' },
          { body: 'venus', group: 'terrestrial', hint: 'Venuša je takmer taká veľká ako Zem a má pevný povrch. Patrí k menším planétam blízko Slnka, alebo k obrom?', confirm: 'Správne! Venuša je kamenná planéta, hoci ju zakrývajú husté oblaky.' },
          { body: 'jupiter', group: 'gas-giant', hint: 'Jupiter je najväčšia planéta a nedá sa na ňom pristáť, lebo nemá pevný povrch. Tvoria ho skôr plyny, alebo ľady?', confirm: 'Správne! Jupiter je plynný obor – najväčšia planéta slnečnej sústavy.' },
          { body: 'mercury', group: 'terrestrial', hint: 'Merkúr je najmenšia planéta a obieha najbližšie k Slnku. Jeho povrch je pevný a plný kráterov.', confirm: 'Správne! Merkúr je kamenná planéta.' },
          { body: 'uranus', group: 'ice-giant', hint: 'Urán je modrozelený obor ďaleko od Slnka. Spomeň si, čo ukrýva pod atmosférou: vodu, čpavok a metán.', confirm: 'Správne! Urán je ľadový obor.' },
          { body: 'earth', group: 'terrestrial', hint: 'Žijeme na pevnom povrchu Zeme. Je Zem menšia planéta blízko Slnka, alebo obor?', confirm: 'Správne! Zem je kamenná planéta – náš domov.' }
        ] },
      // Correct answers sit in different positions so the order gives no hint.
      { id: 'otazka-venusa', type: 'question', title: 'Prečo je Venuša najhorúcejšia?', text: 'Merkúr je bližšie k Slnku. Prečo má napriek tomu Venuša vyššiu teplotu?', options: [{ id: 'blizsie', text: 'Venuša je bližšie k Slnku ako Merkúr.' }, { id: 'atmosfera', text: 'Jej hustá atmosféra zadržiava veľa tepla.' }, { id: 'svetlo', text: 'Venuša vytvára vlastné svetlo ako hviezda.' }], correct: 'atmosfera', correctFeedback: 'Správne! Hustá atmosféra Venuše spôsobuje veľmi silný skleníkový efekt a zadržiava teplo.', incorrectFeedback: 'Skús to znova. Spomeň si, čo obklopuje Venušu a prečo na nej zostáva teplo.' },
      { id: 'otazka-obri', type: 'question', title: 'Kamenné planéty alebo obri?', text: 'Ktoré tvrdenie správne opisuje kamenné planéty a plynných obrov?', options: [{ id: 'obri-povrch', text: 'Plynní obri majú pevný povrch a sú menší.' }, { id: 'vodik', text: 'Kamenné planéty sú tvorené prevažne vodíkom a héliom.' }, { id: 'povrch', text: 'Kamenné planéty majú pevný povrch. Plynní obri nemajú taký povrch.' }], correct: 'povrch', correctFeedback: 'Správne! Merkúr, Venuša, Zem a Mars majú pevný povrch. Jupiter a Saturn sú plynní obri bez takého pevného povrchu.', incorrectFeedback: 'Skús to znova. Spomeň si, na ktorých planétach je pevný povrch a ktoré tvoria najmä plyny.' },
      { id: 'otazka-ladovi-obri', type: 'question', title: 'Čím sú výnimoční ľadoví obri?', text: 'Prečo Urán a Neptún nazývame ľadovými obrami?', next: 'Dokončiť lekciu', options: [{ id: 'latky', text: 'Vo svojom vnútri obsahujú veľa vody, čpavku a metánu.' }, { id: 'zamrznuty', text: 'Majú zamrznutý povrch, po ktorom môžeme kráčať.' }, { id: 'bez-atmosfery', text: 'Na rozdiel od ostatných planét nemajú atmosféru.' }], correct: 'latky', correctFeedback: 'Správne! Urán a Neptún obsahujú veľa látok, ktoré vedci nazývajú ľady – napríklad vodu, čpavok a metán. Neznamená to, že majú obyčajný zamrznutý povrch.', incorrectFeedback: 'Skús to znova. Názov ľadový obor súvisí s látkami vo vnútri planéty, nie s ľadovou zemou pod nohami.' },
      { id: 'zaver', type: 'summary', title: 'Výborne! Expedícia je na konci.', ideas: ['Okolo Slnka obieha osem planét – od Merkúra po Neptún.', 'Kamenné planéty Merkúr, Venuša, Zem a Mars sú menšie, majú pevný povrch a sú bližšie k Slnku.', 'Plynní obri Jupiter a Saturn sú najväčšie planéty a nemajú pevný povrch.', 'Ľadoví obri Urán a Neptún sú najďalej od Slnka a ukrývajú veľa vody, čpavku a metánu.'], text: 'Pokračuj v objavovaní alebo si vyskúšaj kvíz o všetkých ôsmich planétach.' }
    ]
  }]
};
