import type { ComponentPropsWithoutRef } from "react";

/**
 * Patriota site container — 1216px max-width centered with 15px side padding.
 * The container itself is constrained; section backgrounds extend full-bleed
 * outside it.
 */
export function Container({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={`mx-auto w-full max-w-[1216px] px-[15px] ${className}`}
      {...props}
    />
  );
}
