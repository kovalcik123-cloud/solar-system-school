// Test-only fixture (Phase 6H.6.1): the complete eight-step Light Laboratory lesson for the future topic "Svetlo a vesmírne
// vzdialenosti" (internal topic id "pohyb"). It is injected only into the test browser by the harnesses; the application's own
// learn-content.sk.js is not changed and the real "pohyb" topic stays inactive ("Pripravujeme").
'use strict';

// The future topic card, applied to the existing "pohyb" topic inside the test browser only.
const topic = Object.freeze({
  id: 'pohyb', title: 'Svetlo a vesmírne vzdialenosti',
  description: 'Zisti, ako ďaleko doletí svetlo za sekundu a ako dlho mu trvá cesta zo Slnka k planétam.', minutes: 9
});

const lesson = Object.freeze({
  id: 'pohyb', title: 'Svetlo a vesmírne vzdialenosti',
  objective: 'Zistíš, ako rýchlo letí svetlo, ako ďaleko doletí za sekundu a za 15 sekúnd a ako dlho mu trvá cesta zo Slnka k planétam.',
  // The distance conventions of the three experiments, the constant speed of light and the meaning of the accelerated playback.
  limitation: 'Rýchlosť svetla je vo všetkých pokusoch rovnaká. Pri pokuse za 1 sekundu meriame od povrchu Zeme k povrchu Mesiaca, pri 15 sekundách priemernú vzdialenosť stredov Zeme a Mesiaca a pri planétach priemerné vzdialenosti od stredu Slnka k stredu planét. Cestu k planétam prehrávame zrýchlene – svetlo pritom neletí rýchlejšie a veľké hodiny ukazujú skutočný čas jeho letu. Značky planét a ich rad sú len názorné.',
  sources: ['https://www.bipm.org/en/publications/si-brochure', 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html', 'https://ssd.jpl.nasa.gov/planets/approx_pos.html'],
  steps: [
    { id: 'uvod', type: 'intro', title: 'Svetlo – najrýchlejší posol',
      text: 'Svetlo je najrýchlejšie, čo poznáme – za jednu sekundu preletí takmer 300 000 km. Je to však dosť rýchlo na cestu vesmírom? Vyskúšaj to v troch pokusoch.', next: 'Začať' },
    { id: 'jedna-sekunda', type: 'experiment', title: 'Svetlo za jednu sekundu',
      text: 'Svetlo vyšleme z povrchu Zeme smerom k Mesiacu. Odhadni, kam sa dostane za jednu sekundu, a potom ho nechaj doletieť až k povrchu Mesiaca.',
      experiment: { kind: 'light-travel', journey: 'earth-moon' } },
    // Phase 6H.6.3: a transition is shown in the panel before the light starts (also on phones); the 15 s sentence lives only there.
    { id: 'patnast-sekund', type: 'experiment', title: 'Svetlo za 15 sekúnd',
      transition: 'Za jednu sekundu svetlo takmer doletelo k Mesiacu. Kam sa dostane za 15 sekúnd?',
      experiment: { kind: 'light-travel', journey: 'fifteen' } },
    { id: 'k-planetam', type: 'experiment', title: 'Svetlo zo Slnka k planétam',
      transition: 'K planétam je to oveľa ďalej. Prehrávanie zrýchlime, ale svetlo bude letieť stále rovnako rýchlo.',
      text: 'Doteraz bežal čas naozaj. K planétam je to však tak ďaleko, že cestu zrýchlime – veľké hodiny budú stále ukazovať skutočný čas letu svetla.',
      experiment: { kind: 'light-travel', journey: 'planets' } },
    // Correct answers sit in different positions so the order gives no hint.
    { id: 'otazka-cas', type: 'question', title: 'Skutočný alebo zrýchlený čas?', text: 'Na ceste k Neptúnu bolo prehrávanie 600-krát rýchlejšie. Čo to znamená?',
      options: [{ id: 'rychlejsie', text: 'Svetlo letelo 600-krát rýchlejšie.' }, { id: 'zrychlene', text: 'Pokus sme si pustili zrýchlene, svetlo letí stále rovnako rýchlo.' }, { id: 'blizsie', text: 'Neptún bol 600-krát bližšie.' }],
      correct: 'zrychlene', correctFeedback: 'Správne! Zrýchlili sme len prehrávanie. Svetlo letí stále rovnako rýchlo a veľké hodiny ukazujú skutočný čas jeho letu.',
      incorrectFeedback: 'Skús to znova. Spomeň si, čo ukazovali veľké hodiny počas zrýchleného prehrávania.' },
    { id: 'otazka-oneskorenie', type: 'question', title: 'Prečo vidíme Slnko s oneskorením?', text: 'Svetlo zo Slnka letí k Zemi asi 8 minút. Čo to znamená?',
      options: [{ id: 'pred-8-min', text: 'Slnko vidíme také, aké bolo asi pred 8 minútami.' }, { id: 'teraz', text: 'Slnko vidíme presne také, aké je práve teraz.' }, { id: 'vcera', text: 'Slnko vidíme také, aké bolo včera.' }],
      correct: 'pred-8-min', correctFeedback: 'Správne! Svetlo, ktoré práve vidíme, vyšlo zo Slnka asi pred 8 minútami.',
      incorrectFeedback: 'Skús to znova. Koľko času potrebuje svetlo na cestu zo Slnka k Zemi?' },
    { id: 'otazka-sekunda', type: 'question', title: 'Ako ďaleko doletí svetlo za sekundu?', text: 'Kam sa dostane svetlo vyslané zo Zeme za jednu sekundu?', next: 'Dokončiť lekciu',
      options: [{ id: 'slnko', text: 'Až k Slnku.' }, { id: 'slovensko', text: 'Len na druhý koniec Slovenska.' }, { id: 'mesiac', text: 'Takmer k Mesiacu.' }],
      correct: 'mesiac', correctFeedback: 'Správne! Za jednu sekundu svetlo prejde takmer 300 000 km – takmer celú cestu k Mesiacu.',
      incorrectFeedback: 'Skús to znova. Spomeň si na prvý pokus so Zemou a Mesiacom.' },
    { id: 'zaver', type: 'summary', title: 'Čo sme objavili?',
      ideas: ['Svetlo preletí za sekundu takmer 300 000 km.', 'Za 1 sekundu takmer doletí k Mesiacu, za 15 sekúnd 11,7-krát ďalej.', 'Zo Slnka k Zemi letí asi 8 minút, k Neptúnu viac ako 4 hodiny.', 'Zrýchlené prehrávanie nemení rýchlosť svetla.'],
      text: 'Pokračuj v objavovaní alebo si vyskúšaj kvíz o planétach.' }
  ]
});

// The script the harness appends to learn-content.sk.js inside the test browser: the future topic card and the lesson.
// "change" optionally edits a copy of the lesson (e.g. an invalid journey) for validation tests.
// Phase 6H.6.2: this fixture stands for the future real "pohyb" lesson, so it replaces a "pohyb" lesson if the app's content
// already has one (after activation) and adds it otherwise. It never creates a second lesson with the same ID.
function inject(change = null) {
  const copy = JSON.parse(JSON.stringify(lesson));
  if (change) change(copy);
  return `(() => { const t = window.LearnContent.topics.find(x => x.id === 'pohyb'); Object.assign(t, ${JSON.stringify(topic)});
    const lessons = window.LearnContent.lessons, at = lessons.findIndex(l => l.id === 'pohyb'), lesson = ${JSON.stringify(copy)};
    if (at >= 0) lessons.splice(at, 1, lesson); else lessons.push(lesson); })();`;
}

module.exports = { topic, lesson, inject };
