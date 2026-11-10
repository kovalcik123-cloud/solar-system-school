// Test-only fixture lesson (from the Phase 6H.3 harness light62.js), read by light632.js with its original regular expression.
// Injected only into the test browser; it is not part of the application's content.
const FIXTURE = `window.LearnContent.lessons.push(${JSON.stringify({ id: 'pohyb', title: 'Svetlo — technický test', objective: 'Len na testovanie.', limitation: 'Len na testovanie.', steps: [
  { id: 'uvod', type: 'intro', title: 'Úvod — test', text: 'Len na testovanie.' },
  { id: 'svetlo', type: 'experiment', title: 'Svetlo — test', text: 'Len na testovanie.', experiment: { kind: 'light-travel', durationSeconds: 1 } },
  { id: 'zaver', type: 'summary', title: 'Koniec testu', ideas: ['Len na testovanie.'], text: 'Len na testovanie.' }] })});`;
