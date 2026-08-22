// Training: mark curriculum sessions complete so the Training tab shows progress.
// Keys come from anything/apps/mobile/src/data/trainingCurriculum.js.
const COMPLETIONS = [
  ["puppy-essentials", "name-recognition"],
  ["puppy-essentials", "handling-touch"],
  ["puppy-essentials", "potty-routine"],
  ["basic-obedience", "sit"],
  ["basic-obedience", "down"],
  ["basic-obedience", "stay"],
  ["leash-manners", "engagement"],
];

export default async function seedTraining(ctx) {
  const { A, mango, report } = ctx;
  const r = report.section("Training");
  const petId = mango.id;

  let done = new Set();
  try {
    const res = await A.get(`/api/training/self-progress?petId=${petId}`);
    for (const c of res.data?.completed || []) {
      done.add(`${c.program_key}:${c.session_key}`);
    }
  } catch (e) {
    r.note(`could not read training progress: ${e.message}`);
  }

  let made = 0;
  for (const [programKey, sessionKey] of COMPLETIONS) {
    if (done.has(`${programKey}:${sessionKey}`)) {
      r.skipped(`${programKey}/${sessionKey}`);
      continue;
    }
    try {
      const res = await A.post("/api/training/self-progress", {
        petId,
        programKey,
        sessionKey,
        completed: true,
      });
      if (res.ok) {
        made++;
        r.created(`${programKey}/${sessionKey}`);
      } else {
        r.error(`${programKey}/${sessionKey}: ${res.status} ${JSON.stringify(res.data).slice(0, 120)}`);
      }
    } catch (e) {
      r.error(`${programKey}/${sessionKey}: ${e.message}`);
    }
  }
  if (made === 0 && done.size > 0) r.note(`${done.size} session(s) already complete`);
}
