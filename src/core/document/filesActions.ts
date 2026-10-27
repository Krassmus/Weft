import { useAssetStore } from "../assets/assetStore";
import { filesCheckPassword, filesCreateProtection, filesDecrypt, filesEncrypt } from "../runtime/filesCrypto.js";
import type { FilesKey } from "../runtime/filesCrypto.js";
import type { Block, FileEntry, FilesBlock, FilesProtection } from "../types";
import { createId } from "../id";
import { plain, removeWhere } from "./plain";
import type { BlockContainerRef } from "./store";
import { useDocumentStore } from "./store";
import { tr } from "../i18n/tr";

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
  if (!block || block.kind !== "files") throw new Error(tr("ui.this_element_no_longer_exists"));
  return block;
}

async function bytesOf(assetId: string): Promise<Uint8Array> {
  const blob = useAssetStore.getState().blobs.get(assetId);
  if (!blob) throw new Error(tr("ui.one_of_the_files_has_not"));
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

async function keyFor(protection: FilesProtection | null, password: string | null): Promise<FilesKey | null> {
  if (!protection) return null;
  const key = password === null ? null : await filesCheckPassword(protection, password);
  if (!key) throw new Error(tr("ui.wrong_password"));
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
  useDocumentStore.getState().edit(tr("ui.add_files_2"), (m) => {
    const target = blocksOf(m, container)?.[blockId];
    if (!target || target.kind !== "files") return;
    for (const { meta, entry } of created) {
      m.assets.push(meta);
      target.files.push(entry);
    }
  });
}

/** Gives a card of a matching (MatchingBlock) a picture: the file becomes an asset of the module, and the card shows it. */
export async function setMatchingImage(container: BlockContainerRef, blockId: string, itemId: string, file: File): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = createId();
  const mimeType = file.type || "application/octet-stream";
  useAssetStore.getState().setAsset(id, new Blob([bytes as BlobPart], { type: mimeType }));
  useDocumentStore.getState().edit("Bild für Matching wählen", (m) => {
    const block = blocksOf(m, container)?.[blockId];
    if (!block || block.kind !== "matching") return;
    const item = [...block.sources, ...block.targets].find((it) => it.id === itemId);
    if (!item) return;
    m.assets.push({ id, fileName: file.name, mimeType });
    item.kind = "image";
    item.assetId = id;
  });
}

/** Gives an object of a sorting puzzle (SortBlock) a picture: the file becomes an asset of the module, and the object shows it. */
export async function setSortImage(container: BlockContainerRef, blockId: string, itemId: string, file: File): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = createId();
  const mimeType = file.type || "application/octet-stream";
  useAssetStore.getState().setAsset(id, new Blob([bytes as BlobPart], { type: mimeType }));
  useDocumentStore.getState().edit("Bild für Sortierrätsel wählen", (m) => {
    const block = blocksOf(m, container)?.[blockId];
    if (!block || block.kind !== "sort") return;
    const item = block.items.find((it) => it.id === itemId);
    if (!item) return;
    m.assets.push({ id, fileName: file.name, mimeType });
    item.kind = "image";
    item.assetId = id;
  });
}

/** Adds a picture as the last object of a sorting puzzle (SortBlock) - one step of the history: the file becomes an asset of the module. */
export async function addSortImage(container: BlockContainerRef, blockId: string, file: File): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = createId();
  const mimeType = file.type || "application/octet-stream";
  useAssetStore.getState().setAsset(id, new Blob([bytes as BlobPart], { type: mimeType }));
  useDocumentStore.getState().edit("Bild zum Sortierrätsel hinzufügen", (m) => {
    const block = blocksOf(m, container)?.[blockId];
    if (!block || block.kind !== "sort") return;
    m.assets.push({ id, fileName: file.name, mimeType });
    block.items.push({ id: createId(), kind: "image", text: "", assetId: id });
  });
}

/** Adds pictures to a gallery (GalleryBlock), each as its last picture - one step of the history, however many files: they become assets of the module. */
export async function addGalleryImages(container: BlockContainerRef, blockId: string, files: File[]): Promise<void> {
  const made: { id: string; fileName: string; mimeType: string }[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const id = createId();
    const mimeType = file.type || "application/octet-stream";
    useAssetStore.getState().setAsset(id, new Blob([bytes as BlobPart], { type: mimeType }));
    made.push({ id, fileName: file.name, mimeType });
  }
  if (made.length === 0) return;
  useDocumentStore.getState().edit(made.length === 1 ? "Bild zur Galerie hinzufügen" : "Bilder zur Galerie hinzufügen", (m) => {
    const block = blocksOf(m, container)?.[blockId];
    if (!block || block.kind !== "gallery") return;
    for (const asset of made) {
      m.assets.push(asset);
      block.items.push({ id: createId(), assetId: asset.id, caption: "" });
    }
  });
}

/** Gives a picture of a gallery (GalleryBlock) another file. */
export async function setGalleryImage(container: BlockContainerRef, blockId: string, itemId: string, file: File): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = createId();
  const mimeType = file.type || "application/octet-stream";
  useAssetStore.getState().setAsset(id, new Blob([bytes as BlobPart], { type: mimeType }));
  useDocumentStore.getState().edit("Bild der Galerie wählen", (m) => {
    const block = blocksOf(m, container)?.[blockId];
    if (!block || block.kind !== "gallery") return;
    const item = block.items.find((it) => it.id === itemId);
    if (!item) return;
    m.assets.push({ id, fileName: file.name, mimeType });
    item.assetId = id;
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

async function reencrypt(block: FilesBlock, oldKey: FilesKey | null, next: string | null) {
  const created = next !== null ? await filesCreateProtection(next) : null;
  const files: ReturnType<typeof newAsset>[] = [];
  for (const file of block.files) {
    const stored = await bytesOf(file.id);
    const original = oldKey ? await filesDecrypt(oldKey, stored) : stored;
    files.push(newAsset(file.name, file.mimeType, file.size, created ? await filesEncrypt(created.key, original) : original, created !== null));
  }
  return { files, protection: created?.protection ?? null };
}
