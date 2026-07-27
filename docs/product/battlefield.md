# The Battlefield

The Battlefield supports the operational work of running an encounter. Its first purpose is managing combat state and combatant information—not rendering a virtual tabletop.

## Core jobs

- Build an encounter from known characters and reusable adversaries.
- Add an improvised combatant quickly.
- Establish, adjust, and advance initiative.
- See the information needed for the current turn.
- Track hit points, conditions, concentration, and limited resources.
- Apply common changes with minimal arithmetic and repeated input.
- End combat and preserve a useful summary.

## Candidate first-release capabilities

- Encounter roster grouped by player characters, allies, and enemies.
- Initiative ordering with ties, delay, and manual reordering.
- Round and current-turn tracking.
- Hit point adjustment, temporary hit points, and defeat state.
- Conditions with optional duration notes.
- Compact combatant summaries and linked Archive details.
- Duplicate combatants with distinct encounter state.
- Encounter notes and a result summary.

## State boundaries

A reusable Archive record describes a character or creature. An encounter participant is a reference or snapshot plus temporary state such as current hit points and conditions. The product must define when later Archive edits affect an active or completed encounter.

## Open design concerns

- Which game rules, if any, should the first version automate?
- How are hidden enemies and hidden statistics represented?
- Should player devices receive an initiative view?
- What undo behavior is needed for accidental state changes?
- How should encounters behave when connectivity is lost?
