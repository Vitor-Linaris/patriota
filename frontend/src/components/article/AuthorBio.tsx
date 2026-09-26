import Link from "next/link";
import { imageVariant } from "@/lib/images";

export function AuthorBio({
  initials,
  name,
  role,
  bio,
  avatarUrl,
  profileHref,
}: {
  initials: string;
  name: string;
  role: string;
  bio: string;
  /** The real photo, when there is one. Falls back to `initials`. */
  avatarUrl?: string | null;
  /**
   * When present, the name links through to the full byline profile
   * (/redator/[id]) and a "Ver perfil completo" line is added below the
   * bio — the count of published pieces and the last 10 live there, not
   * duplicated in this in-article card.
   */
  profileHref?: string;
}) {
  const avatar = avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageVariant(avatarUrl, "small") ?? avatarUrl}
      alt=""
      className="h-14 w-14 shrink-0 rounded-full object-cover"
    />
  ) : (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-patriota-pure text-[18px] font-bold text-patriota-accent">
      {initials}
    </span>
  );

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="flex gap-4">
        {profileHref ? (
          <Link href={profileHref} aria-hidden="true" tabIndex={-1}>
            {avatar}
          </Link>
        ) : (
          avatar
        )}
        <div className="min-w-0">
          <p className="text-[16px] font-bold text-slate-900">
            {profileHref ? (
              <Link href={profileHref} className="hover:text-patriota-medium hover:underline">
                {name}
              </Link>
            ) : (
              name
            )}
          </p>
          <p className="text-[13px] text-slate-500">{role}</p>
          <p className="mt-3 text-[14px] leading-relaxed text-slate-700">
            {bio}
          </p>
          {profileHref && (
            <Link
              href={profileHref}
              className="mt-3 inline-block text-[13px] font-semibold text-patriota-medium hover:underline"
            >
              Ver perfil completo →
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
