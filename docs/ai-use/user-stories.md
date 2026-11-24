## AI Use Case: Drafting the User Stories

User stories were first captured by us in bullet points and rough half-sentences, covering the required role, goal, and acceptance criteria, but without any finished wording.

Instead of manually writing out full sentences for ~40 stories, we used an AI tool to turn our rough notes into consistently structured, properly phrased user stories.

**Approach:** The bullet-point notes for each story were given to the AI, which produced the connected "As a … I want … so that …" sentences plus matching acceptance criteria. All substantive content (requirement, role, scope) still came from us; the AI was used purely for language and consistent structuring, not for content decisions.

**Result:** A set of clearly worded, uniformly structured user stories, with no scoping or prioritization decisions delegated to the AI.

## AI Use Case: API Assessment and Comparison Against the API Specification

For every user story we had to judge whether and how it could be implemented against the existing API specification ([openapi.yaml](../openapi.yaml)) — directly possible, possible via workaround, or not possible at all.

The actual analysis (which request fits, which gap exists, which workaround was chosen, and why) was done by us. AI tools were used to format this self-authored assessment consistently and to check it against the API specification for errors.

**Approach:** Our notes per story (matching request, identified gap, chosen workaround, reasoning/risk) were given to the AI together with [openapi.yaml](../openapi.yaml), in order to clean up the wording, unify formatting, and flag any mismatches between our assessment and the actual parameters/error codes defined in the specification.

**Result:** A consistently formatted assessment that was checked against the specification, where the technical judgment is entirely ours and the AI only assisted with phrasing and error-checking.
