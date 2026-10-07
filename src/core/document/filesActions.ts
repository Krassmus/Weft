import { useAssetStore } from "../assets/assetStore";
import { filesCheckPassword, filesCreateProtection, filesDecrypt, filesEncrypt } from "../runtime/filesCrypto.js";
import type { Block, FileEntry, FilesBlock, FilesProtection } from "../types";
import { createId } from "../id";
import { plain, removeWhere } from "./plain";
import type { BlockContainerRef } from "./store";
import { useDocumentStore } from "./store";

// Everything a files block's panel does with its files and password. The password is only ever an
// argument here, used to derive a key and then dropped - what is stored is the protection (salt, a verifier,
// see runtime/filesCrypto.js) and the files, whose bytes are encrypted assets while the block has a password.
// An asset's bytes never change under its id (other people's copies would not notice): changing a password
// makes new assets and points the block's files at them.

function blocksOf(m: { pages: Record<string, { blocks: Record<string, Block> }>; layouts: Record<string, { blocks: Record<string, Block> }> }, container: BlockContainerRef) {
  return container.kind === "page" ? m.pages[container.pageId]?.blocks : m.layouts[container.layoutId]?.blocks;
}

function currentFilesBlock(container: BlockContainerRef, blockId: string): FilesBlock {
  const content = useDocumentStore.getState().doc.content;
  const block = blocksOf(content, container)?.[blockId];
  if (!block || block.kind !== "files") throw new Error("Das Element gibt es nicht mehr.");
  return block;
}

async function bytesOf(assetId: string): Promise<Uint8Array> {
  const blob = useAssetStore.getState().blobs.get(assetId);
  if (!blob) throw new Error("Eine der Dateien ist hier noch nicht angekommen (sie kommt von den anderen, sobald jemand online ist, der sie hat).");
  return new Uint8Array(await blob.arrayBuffer());
}

/** An asset for `bytes` (encrypted already, if the block has a password): its meta, to be pushed to the module's
 * assets, and the entry for the block's list. */
function newAsset(name: string, mimeType: string, size: number, bytes: Uint8Array, encrypted: boolean) {
  const id = createId();
  const stored = encrypted ? "application/octet-stream" : mimeType;
  useAssetStore.getState().setAsset(id, new Blob([bytes as BlobPart], { type: stored }));
  return {
    // The name in the archive says what it is - the original's name stays in the entry.
    meta: { id, fileName: encrypted ? `${name}.enc` : name, mimeType: stored },
    entry: { id, name, mimeType, size } satisfies FileEntry,
  };
}

async function keyFor(protection: FilesProtection | null, password: string | null): Promise<CryptoKey | null> {
  if (!protection) return null;
  const key = password === null ? null : await filesCheckPassword(protection, password);
  if (!key) throw new Error("Falsches Passwort.");
  return key;
}

/** Adds files to a block - encrypted with `password` if the block has one (which must be the right one). */
export async function addFilesToBlock(container: BlockContainerRef, blockId: string, files: File[], password: string | null): Promise<void> {
  const block = currentFilesBlock(container, blockId);
  const key = await keyFor(block.protection, password);
  const created: ReturnType<typeof newAsset>[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    created.push(newAsset(file.name, file.type || "application/octet-stream", file.size, key ? await filesEncrypt(key, bytes) : bytes, key !== null));
  }
  if (created.length === 0) return;
  useDocumentStore.getState().edit("Dateien hinzufügen", (m) => {
    const target = blocksOf(m, container)?.[blockId];
    if (!target || target.kind !== "files") return;
    for (const { meta, entry } of created) {
      m.assets.push(meta);
      target.files.push(entry);
    }
  });
}

export function removeFileFromBlock(container: BlockContainerRef, blockId: string, fileId: string): void {
  useDocumentStore.getState().edit("Datei entfernen", (m) => {
    const target = blocksOf(m, container)?.[blockId];
    if (target && target.kind === "files") removeWhere(target.files, (file) => file.id === fileId);
  });
}

/** Sets, changes or removes the password of a block: `current` is the password it has now (null: none),
 * `next` the one it gets (null: none). All its files are decrypted and encrypted again accordingly. Throws
 * "Falsches Passwort." if `current` is wrong - and changes nothing if anything fails halfway. */
export async function setFilesPassword(container: BlockContainerRef, blockId: string, current: string | null, next: string | null): Promise<void> {
  const block = currentFilesBlock(container, blockId);
  const oldKey = await keyFor(block.protection, current);
  const created = block.protection || next !== null ? await reencrypt(block, oldKey, next) : null;
  if (!created) return;
  useDocumentStore.getState().edit(next === null ? "Passwort entfernen" : "Passwort setzen", (m) => {
    const target = blocksOf(m, container)?.[blockId];
    if (!target || target.kind !== "files") return;
    created.files.forEach(({ meta, entry }, i) => {
      m.assets.push(meta);
      if (target.files[i]) target.files[i].id = entry.id;
    });
    target.protection = created.protection ? plain(created.protection) : null;
  });
}

async function reencrypt(block: FilesBlock, oldKey: CryptoKey | null, next: string | null) {
  const created = next !== null ? await filesCreateProtection(next) : null;
  const files: ReturnType<typeof newAsset>[] = [];
  for (const file of block.files) {
    const stored = await bytesOf(file.id);
    const original = oldKey ? await filesDecrypt(oldKey, stored) : stored;
    files.push(newAsset(file.name, file.mimeType, file.size, created ? await filesEncrypt(created.key, original) : original, created !== null));
  }
  return { files, protection: created?.protection ?? null };
}
