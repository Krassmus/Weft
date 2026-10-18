import gearIconSvg from "../../../../mockups/icons/admin.svg?raw";

/** What a logic block (see ScriptBlock) looks like in the editor - on the slide and in its thumbnail: a green hexagon with a gear in it.
 * The player shows nothing of it. */
export function ScriptHexagon() {
  return (
    <div className="weft-script-hex">
      <span className="weft-script-hex-gear" dangerouslySetInnerHTML={{ __html: gearIconSvg }} />
    </div>
  );
}
