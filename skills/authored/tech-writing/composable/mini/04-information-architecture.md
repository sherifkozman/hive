# Information Architecture

How to structure pages and doc sets so readers find and consume the right thing fast.

- **One page, one job.** If a page answers more than one reader question, split it. Competing half-answers on multiple pages are worse than one canonical page. Ensure exactly one authoritative page per topic.
- **Front-load the answer.** Use the inverted pyramid: conclusion or result first, then detail, then background. Readers scan the first line of each section and bail early, so the payoff must come first. "To reset your password, open Settings" beats "Open Settings, which you can find in order to reset your password."
- **Make it scannable.** Write descriptive, task-stating headings ("Rotate an API key") not vague nouns ("Keys"). A reader scanning the table of contents should predict exactly what each page contains.
- **Progressive disclosure.** Keep the common case in the main flow; push rare cases, flags, and caveats into collapsible sections, footnotes, or linked pages. Don't tax the 90% to serve the 10%.
- **Parallel structure.** Sibling sections should share shape. Every API method page: Description → Parameters → Returns → Errors → Example. Predictability lets readers navigate by muscle memory.
- **Link deliberately.** Link the first mention of a concept to its explanation. Don't bury a required prerequisite as an inline mid-sentence link: call it out as a prerequisite block so it cannot be missed.

**Worked example.** A page titled "Configuration" that dumps 40 settings alphabetically forces every reader to scan all of them. Restructure: lead with the 3 settings 90% of users change, in a short "Common configuration" section; move the full list to a reference table below or on a linked page; give each setting a task-oriented sub-heading where relevant ("Increase the request timeout").

**Checklist for a doc set:**
- Can a reader find the right page in one guess from the nav?
- Does each page declare its audience and prerequisites?
- Is there exactly one canonical page per topic (no competing half-answers)?
- Does every page front-load its most important information?
- Are sibling pages structurally parallel?

Good architecture is invisible: the reader lands on the right page, sees the answer at the top, and leaves. Bad architecture makes readers hunt, and hunting readers file support tickets or give up.
