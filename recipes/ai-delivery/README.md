# AI delivery recipe

A projekt kanonikus dokumentumaiból generált AI-instrukciós adaptereket, task-contextet és handoff workflow-t biztosít. Nem telepít modellprovidert, agent runtime-ot, RAG-ot, MCP-szervert vagy más alkalmazás-runtime AI képességet.

```bash
pnpm forge docs:init --prefix=ATLAS --ai
pnpm forge context:build ATLAS-TASK-0001
pnpm forge handoff:new ATLAS-TASK-0001
```
