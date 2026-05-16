export function AuthorBio({
  initials,
  name,
  role,
  bio,
}: {
  initials: string;
  name: string;
  role: string;
  bio: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="flex gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-patriota-medium text-[18px] font-bold text-white">
          {initials}
        </span>
        <div className="min-w-0">
          <p className="text-[16px] font-bold text-slate-900">{name}</p>
          <p className="text-[13px] text-slate-500">{role}</p>
          <p className="mt-3 text-[14px] leading-relaxed text-slate-700">
            {bio}
          </p>
        </div>
      </div>
    </section>
  );
}
