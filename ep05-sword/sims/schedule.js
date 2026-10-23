// EP05 timing follows timeline.js in the browser and in offline sound/bench tools.
// No dependency on the removed modelling/IK explanation scene.
let timeline = globalThis.window?.TIMELINE;
if (!timeline && typeof process !== 'undefined' && process.versions?.node) {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../timeline.js', import.meta.url), 'utf8');
  timeline = JSON.parse(source.replace(/^\s*window\.TIMELINE\s*=\s*/, '').replace(/;\s*$/, ''));
}
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const scene = id => timeline?.scenes?.find(s => s.id === id);
const start = (id, fallback) => finite(scene(id)?.start, fallback);
const line = (id, i, fallback) => finite(scene(id)?.lines?.[i]?.start, start(id, fallback));
const cut = 47.957 - start('flock', 27.737);
// The old choreography is preserved on either side of the editorial cut.
export const motionTime = t => t < start('flock', 27.737) ? t : t + cut;
export const T = {
  rise0: line('intro', 1, 4.958) + 0.342,
  form: finite(scene('flock')?.voiceEnd, 46.609) - 0.029,
  foe: start('ecs', 48.109) + 0.271,
  roles: line('ecs', 2, 60.695) + 0.385,
  climax: line('climax', 1, 113.638) - 0.258,
  break: line('climax', 1, 113.638) + 3.742,
  recall: start('recall', 124.654) + 0.526,
  rest: start('outro', 133.211) + 8.569,
};
if (!Object.values(T).every(Number.isFinite)) throw new Error('EP05 schedule must contain only finite times');
