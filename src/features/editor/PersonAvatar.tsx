import type { CSSProperties } from "react";

/** First letter of a name. */
function initialOf(name: string): string {
  return (name.trim()[0] ?? "?").toLocaleUpperCase();
}

/**
 * A person's avatar: their picture if they have one, else the first letter of their name on their
 * colour. A round badge of `size` pixels.
 */
export function PersonAvatar({
  name,
  color,
  avatar,
  size = 26,
  className,
}: {
  name: string;
  color: string;
  avatar: string | null;
  size?: number;
  className?: string;
}) {
  const style: CSSProperties = { width: size, height: size, fontSize: Math.round(size * 0.46), background: color };
  return (
    <span className={"weft-person-avatar" + (className ? ` ${className}` : "")} style={style} title={name}>
      {avatar ? <img src={avatar} alt="" draggable={false} /> : initialOf(name)}
    </span>
  );
}
