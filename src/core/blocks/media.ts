import type { BlockProblem } from "./types";

/** The words of "the kind of block" in what `weft validate` says about a file: `image-Block hat noch keine Datei.` */
export function mediaProblems(block: { kind: string; assetId: string | null; alt?: string }, module: { assets: { id: string }[] }): BlockProblem[] {
  const problems: BlockProblem[] = [];
  if (!block.assetId) {
    problems.push({ level: "warning", code: "media-empty", message: `${block.kind}-Block hat noch keine Datei.` });
    return problems;
  }
  if (!module.assets.some((asset) => asset.id === block.assetId))
    problems.push({ level: "error", code: "asset-missing", message: `${block.kind}-Block verweist auf die Datei ${block.assetId}, die nicht in der Liste der Dateien steht.` });
  if (block.kind === "image" && !block.alt?.trim()) problems.push({ level: "info", code: "image-no-alt", message: "Bild ohne Alternativtext." });
  return problems;
}

/** The name of the file of a block (`block.assetId`) in the list of the module's files, if it is given. */
export function fileNameOf(assetId: string | null, assets: { id: string; fileName: string }[] | undefined): string | undefined {
  return assets?.find((asset) => asset.id === assetId)?.fileName;
}
