"use client";

/**
 * Small, accessible on/off switch. Uses `inline-flex items-center` on
 * the track so the thumb is vertically centered without absolute
 * positioning hacks — that was the bug where the thumb was clipping
 * outside the track on the publicity page.
 *
 * Two sizes:
 *   sm — h-5 w-9 thumb 16, used on inline lists (slot cards)
 *   md — h-6 w-11 thumb 16, used inside modals where it stands alone
 */
export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  size?: "sm" | "md";
  /** Visible label for screen readers (and clickable area). */
  label?: string;
  title?: string;
  disabled?: boolean;
}

export function Toggle({
  checked,
  onChange,
  size = "md",
  label,
  title,
  disabled,
}: ToggleProps) {
  const track =
    size === "sm"
      ? "h-5 w-9 px-0.5"
      : "h-6 w-11 px-0.5";
  const thumb = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  // Translate is the track width minus the thumb width minus 2× the
  // padding (4px total). For sm: 36 - 16 - 4 = 16 → translate-x-4.
  // For md: 44 - 20 - 4 = 20 → translate-x-5.
  const onTranslate = size === "sm" ? "translate-x-4" : "translate-x-5";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex shrink-0 items-center rounded-full transition-colors ${track} ${
        checked ? "bg-[#0F2C6B]" : "bg-gray-300"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span
        className={`inline-block rounded-full bg-white shadow transition-transform duration-200 ${thumb} ${
          checked ? onTranslate : "translate-x-0"
        }`}
      />
    </button>
  );
}
