
# Audience Analysis & Job-to-be-Done

Never write a doc until you can name three things: (a) the reader, (b) the task they are mid-way through, and (c) what "done" looks like for them. Documentation is read by people under load — mid-incident, mid-integration, mid-evaluation — not studied at leisure.

Segment readers on three axes:

- **Expertise**: novice vs. expert. Novices need concepts and orientation; experts need a searchable reference and copy-paste snippets. Do not force an expert through a tutorial to find one flag name.
- **Goal**: evaluating (should I adopt this?), integrating (make it work now), operating (keep it running), debugging (why did it break?). Each goal wants a different document type and depth.
- **Context of use**: at a terminal, on a phone mid-incident, in a procurement meeting. Context dictates length, scannability, and where the answer must appear.

**Worked example.** "How do I authenticate?" comes from at least two readers. The evaluator wants to know *which* auth methods exist and their tradeoffs — one paragraph and a table. The integrator wants a working request *right now* — a labeled code block with a real-looking token. Answer both, in that order, and label each so readers skip to their part.

**State assumed prior knowledge explicitly at the top**: "This guide assumes a running cluster and kubectl configured." Unstated assumptions are the single largest cause of doc failure — the reader hits an undocumented prerequisite, gets stuck, and blames the product.

Practical habits:
- Write a one-line reader statement before drafting: "For an integrator who already has an API key and wants their first successful call."
- List prerequisites as an up-front checklist, not scattered inline.
- When a page must serve two audiences, split it into clearly labeled sections rather than blending — blended docs frustrate both readers at once.
- Prefer specifics the reader can check ("you need Node 18+") over vague reassurance ("recent Node").

The audience decision drives every later choice: document type, structure, tone, and how much you explain versus assume. Get it wrong and even flawless prose fails, because it answers a question the reader did not ask.
