// A minimal sync server for Weft documents: a Node process that is one more peer in the Automerge
// network - always online, relaying changes between whoever is connected and keeping every document
// it has seen in memory, so someone can join (or come back) while everybody else is offline.
// Run with `npm run collab-server` (PORT, default 3030).
//
// Spike: no storage (documents are gone when the process stops), no access control (anybody who knows
// a document's URL can open it).
import "@automerge/automerge"; // sets up the WebAssembly the repo relies on
import { WebSocketServer } from "ws";
import { Repo } from "@automerge/automerge-repo";
import { NodeWSServerAdapter } from "@automerge/automerge-repo-network-websocket";

const port = Number(process.env.PORT ?? 3030);
const wss = new WebSocketServer({ port });
const repo = new Repo({
  network: [new NodeWSServerAdapter(wss)],
  peerId: "weft-sync-server",
  // Relay every document to every peer that asks for it.
  sharePolicy: async () => true,
});
wss.on("connection", () => console.log(`peer connected (${wss.clients.size} connected)`));
console.log(`Weft sync server listening on ws://localhost:${port}`);
void repo;
