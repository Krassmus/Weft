// Importing "@automerge/automerge" (aliased in vite.config.ts to its embedded-WebAssembly entry) is
// what sets the WebAssembly up: automerge-repo itself only imports the "slim" entry, which has none.
// This module is the one place that does it, and has to come before anything else touches Automerge.
import * as Automerge from "@automerge/automerge";
import { Repo } from "@automerge/automerge-repo";

export { Automerge, Repo };
