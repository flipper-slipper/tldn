---
description: Draw this project's architecture with VibeBlocks and show the diagram
---

Map the architecture of the project in the current working directory with the VibeBlocks tools,
then show it to me. Pass the absolute path of the current working directory as `path` in every
VibeBlocks tool call.

1. Call `get_model`. If a model already exists and has no errors, go to step 4.
2. Call `get_guide` and follow it: read the project's code, then build the model with
   `update_model`. Fix every error it returns and resolve the warnings until it saves cleanly with
   every source file on the map.
3. Do not change any of the project's own files. Only the VibeBlocks tools write anything.
4. Call `show_map`.
5. In three or four short sentences, say what the system is, its main parts, and that I can click
   into any box on the diagram to go a level deeper.

$ARGUMENTS
