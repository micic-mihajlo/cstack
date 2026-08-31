# Pattern catalog

Use this catalog for substantial rewrites, prose reviews, or drafts with several AI tells. Do not load it for a one-line edit.

## Content failures

### Inflated importance

Cut claims that ordinary facts mark a pivotal moment, shape a broader landscape, leave an indelible mark, serve as a testament, or set the stage for something larger. State the event and its direct consequence.

### Notability padding

Do not list publications, awards, followers, or experts merely to imply importance. Keep the source that contributes actual context.

### Promotional copy without evidence

Replace "vibrant," "breathtaking," "renowned," "groundbreaking," "stunning," "must-visit," "nestled," and figurative "rich" with concrete description.

### Vague attribution

Name the source behind "experts believe," "industry reports suggest," "observers note," or "critics argue." If no source exists, remove the attribution and any claim it cannot support.

### Formulaic challenge sections

Replace "Despite these challenges, X continues to thrive" and stock future-outlook sections with the specific problem, response, or plan. Cut the section when the source has none.

### Speculative gap filling

Do not turn missing information into a story about privacy, a low profile, a likely childhood, or what someone "is believed" to have done. State that the fact is unknown only when that absence matters.

### Diff narration

Outside changelogs, release notes, and migration guides, describe the current system. Do not narrate what was added, changed, or replaced merely because the text came from a diff.

## Rhetorical templates

### Negative contrast

Remove:

- "not just X, but Y"
- "not only X"
- "it isn't X, it's Y"
- "we are not talking about X, we are talking about Y"

State Y directly and include X only when the distinction carries real information.

### Fake candor

Remove standalone hooks such as "Honestly?", "Look," "Here's the thing," "Let's be honest," "Real talk," "the dirty secret," "plot twist," and "what nobody tells you."

### Persuasive authority

Replace "The real question is," "At its core," "Fundamentally," "What really matters," "the deeper issue," and "the heart of the matter" with the claim itself.

### Signposting

Remove "Let's dive in," "Let's explore," "Let's break this down," "Here's what you need to know," "Now let's look at," and "Without further ado."

### Colon-fronted assertion

Do not write a setup fragment followed by a colon and the same assertion. Use a direct sentence. Keep colons for real lists, definitions, quotations, and examples.

### Aphorism formulas

Translate "X is the Y of Z," "X becomes a trap," "the language of X," "the currency of X," and "the architecture of X" into the concrete mechanism.

### Manufactured punchlines

Do not stack terse declarative sentences to make ordinary material sound momentous. Keep one short sentence for genuine emphasis and connect the rest.

### Tailing negation

Replace clipped endings such as "no guessing," "no wasted motion," or "no extra setup" with a complete consequence, or cut them.

## Sentence and word patterns

### Superficial participles

Watch for trailing clauses beginning with "highlighting," "ensuring," "reflecting," "showcasing," "fostering," "cultivating," "symbolizing," or "contributing." Delete them or replace them with a sourced causal statement.

### AI vocabulary clusters

One formal word is not a problem. Rewrite clusters built from:

- additionally
- align with
- crucial
- delve
- enduring
- enhance
- foster
- garner
- highlight
- interplay
- intricate
- landscape
- pivotal
- showcase
- tapestry
- testament
- underscore
- valuable
- vibrant

Prefer the ordinary word that names the action.

### Copula avoidance

"Serves as," "stands as," "marks," "represents," "boasts," "features," and "offers" often conceal "is" or "has." Use the simple verb unless the elaborate verb adds meaning.

### Filler

Common cuts:

- "in order to" becomes "to"
- "due to the fact that" becomes "because"
- "at this point in time" becomes "now"
- "in the event that" becomes "if"
- "has the ability to" becomes "can"
- "it is important to note that" is deleted

### Hedge stacks

Keep the one qualifier the evidence needs. "Could potentially possibly be argued that it might" usually becomes "may."

### Abstract metaphor nouns

Replace substrate, wedge, vector, locus, vantage, nexus, primitive, modality, paradigm, bedrock, scaffolding, harness, and surface when they hide a concrete component, action, or interface.

### Weak verbs and adverbs

Replace "significantly improves" with the measured improvement. Replace "runs quickly" with the latency or a stronger verb. Do not remove an adverb that carries actual meaning.

### Passive voice and subjectless fragments

Name the actor when it clarifies responsibility. Replace "Queries are validated" with "The compiler validates queries." Keep passive voice when the actor is unknown or irrelevant.

### Synonym cycling

If protagonist, main character, central figure, and hero refer to the same person, pick the correct term and repeat it.

### False ranges

Replace "from ideation to execution" or unrelated "from X to Y" pairs with the actual topics, stages, or endpoints.

### Compound hyphens

Do not flag every hyphenated compound. Use normal grammar. Keep an attributive compound such as "a high-quality report." Drop unnecessary predicate hyphens such as "the report is high quality." Avoid strings of fashionable compounds.

## Structure and formatting

### Forced groups of three

Use the number of items the material contains. Do not add a third synonym, benefit, or example to make the sentence feel complete.

### Uniform block shapes

Do not format a long answer as identical bold-label paragraphs or a wall of equal bullets. Match each part to its content.

### Fragmented headings

Delete a one-line warm-up that repeats the heading before the real paragraph begins.

### Inline-header lists

Avoid bullets like "**Performance:** Performance improved." Use a plain sentence, a real section heading, or a bold lead that contributes new information.

### Decorative formatting

Use sentence case headings. Remove decorative emojis and mechanical bolding. Preserve formatting that carries actual hierarchy or meaning.

### Dash habits

Generated prose should contain no em or en dashes. Replace them with sentence boundaries, commas, or a clearer sentence. Do not alter dashes inside quoted material, code, titles, or data.

### Generic conclusions

Cut "The future looks bright," "Only time will tell," "This is a step in the right direction," and summaries that repeat the answer. End on the last concrete fact or decision.

## Assistant artifacts

Remove:

- "Of course" and "Certainly"
- "Great question" and "You're absolutely right"
- "I hope this helps"
- "Let me know if"
- "Would you like me to"
- "Want me to"
- "I got it"
- "Here is an overview"
- knowledge-cutoff disclaimers that do not help the reader

Keep a genuine question only when the user must answer it to continue.

## False-positive checks

Do not flatten prose merely because it has:

- polished grammar
- formal or academic vocabulary
- mixed casual and formal register
- one transition word
- one short sentence
- one em dash in source material
- curly quotes produced by an editor
- a real salutation or sign-off
- complex formatting from a template

Look for clusters of behavior. When rewriting generated prose, still follow the skill's house style.

## Human signals to preserve

- specific, unusual details
- mixed feelings and unresolved tension
- era-specific slang, jokes, and references
- a writer's deliberate repetition
- varied sentence length
- genuine asides and self-corrections
- claims the writer can defend with a clear reason
