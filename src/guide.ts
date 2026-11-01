// What the agent needs to know to draw and change the model. Returned by get_guide and in the
// MCP server instructions. (Will become a skill when VibeBlocks is packaged as a plugin.)
import { OPS_REFERENCE } from './model/ops';

export const GUIDE = `# VibeBlocks: how to draw and change the C4 model

VibeBlocks shows the project as a C4 diagram the user reads instead of code. You maintain the model with small, validated operations (update_model). Strata-style rules: every claim points at real code.

## Levels
1. Context: the system, the people who use it (people), third-party systems (externals).
2. Containers: things that run or store data on their own: web-app, mobile-app, desktop-app, cli, api, worker, function, library, firmware, and data stores database, cache, queue, storage, search.
3. Components: inside a code container, groups of code by responsibility.
4. Code: VibeBlocks shows the files your components point at.

## Rules (enforced; a batch with an error is refused and nothing changes)
- Ids: lowercase letters, digits, dashes; unique across the model. Names unique among siblings.
- Data stores have no components. Components only live in containers.
- No relationship between an element and its own parent or child.
- Relationship kinds: uses (only from a person), request (HTTP/RPC), command (tell something to act), event (status pushed back), data (read/write a data store; required for arrows into one), external (call a third-party system; required for arrows to one), internal (component to component inside one container).
- Code refs {file, symbol?} must exist: file relative to the repo root, symbol = exact class/function/const name in it. A whole folder is {"file": "src/billing/"} (ending in "/", no symbol): use it when every file in the folder belongs to the component.

## Operations
Each op is an object with an "op" field and exactly these fields ("?" = optional). Any other field is refused.
${OPS_REFERENCE}

Example batch for a made-up app (shape only; a real first batch has every element and arrow of your project):
\`\`\`json
[
  {"op": "set_system", "name": "Recipe Box", "description": "Lets cooks save recipes and get a weekly shopping list."},
  {"op": "add_person", "id": "cook", "name": "Cook", "description": "Saves recipes and plans meals."},
  {"op": "add_external", "id": "openai", "name": "OpenAI", "technology": "OpenAI API", "description": "Reads ingredients out of recipe photos."},
  {"op": "add_container", "id": "mobile", "name": "Mobile App", "type": "mobile-app", "technology": "SwiftUI", "path": "ios", "description": "The app cooks use to save and browse recipes."},
  {"op": "add_container", "id": "backend", "name": "Backend", "type": "api", "technology": "Python, FastAPI", "path": "server", "description": "Stores recipes and builds shopping lists."},
  {"op": "add_container", "id": "store", "name": "Recipe Store", "type": "database", "technology": "SQLite", "path": "server/migrations", "description": "Holds recipes and meal plans."},
  {"op": "add_component", "id": "recipe-screens", "container": "mobile", "name": "Recipe screens", "description": "Lists, shows and adds recipes.", "code": [{"file": "ios/RecipeList.swift", "symbol": "RecipeListView"}]},
  {"op": "add_component", "id": "recipes", "container": "backend", "name": "Recipes", "description": "Saves recipes and their ingredients.", "code": [{"file": "server/recipes.py", "symbol": "RecipeService"}, {"file": "server/main.py"}]},
  {"op": "add_component", "id": "photo-import", "container": "backend", "name": "Photo import", "description": "Turns a recipe photo into ingredients.", "code": [{"file": "server/vision.py", "symbol": "extract_ingredients"}]},
  {"op": "add_relationship", "from": "cook", "to": "recipe-screens", "kind": "uses", "description": "adds a recipe"},
  {"op": "add_relationship", "from": "recipe-screens", "to": "recipes", "kind": "request", "description": "saves recipe", "technology": "POST /recipes"},
  {"op": "add_relationship", "from": "recipes", "to": "photo-import", "kind": "internal", "description": "reads photo"},
  {"op": "add_relationship", "from": "recipes", "to": "store", "kind": "data", "description": "saves recipes", "technology": "SQL"},
  {"op": "add_relationship", "from": "photo-import", "to": "openai", "kind": "external", "description": "extracts ingredients", "technology": "HTTPS"}
]
\`\`\`

## Style (warnings)
- Name components by responsibility in 2-4 plain words ("Orders", "Login & sessions"), never file or class names. 3-7 per container.
- One-sentence descriptions of what it does for the user or the data.
- Store relationships at the most specific level you know (component to component, component to data store or external). Higher-level arrows are computed; do not add them.
- Every box has at least one arrow. Small helpers (a db connection, a logger, utils) are not components: put their files in the code of the component that uses them.
- Every source file is on the map: in some component's code, or under a data store's "path". Tests, configs and generated files are ignored.

## Workflow
- First time: read the code, then one update_model call with all ops (set_system, add_person, add_external, add_container, add_component, add_relationship). Fix every error and call again.
- Then read what update_model returns: fix its warnings with small update ops, and check "map" (the diagram in plain lines) against the code you read.
- Show it: show_map.
- Before changing code for a feature: propose_change with the ops the feature needs. The user sees them dashed on the diagram and approves, modifies or rejects in the chat. Do not edit code until they approve.
- After implementing an approved proposal: apply_proposal (code refs are checked now), then show_map so the user sees what changed.
- After other code changes: update_model with small ops (update, move_component, add_component, remove…). Keep ids and names stable.
`;
