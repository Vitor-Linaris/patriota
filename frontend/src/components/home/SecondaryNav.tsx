import Link from "next/link";
import { Container } from "../Container";
import { getCategories } from "@/lib/categories";

/**
 * Top secondary menu of the public site. Pulls the live category
 * catalogue from /public/categories (only visible ones come back),
 * so admins toggling categories on/off via /admin/categorias is
 * reflected here on the next request.
 */
export async function SecondaryNav() {
  const cats = await getCategories();
  if (cats.length === 0) return null;
  return (
    <div className="bg-[#f0f2f7]">
      <Container className="flex h-9 items-center gap-6 overflow-x-auto text-[12px] font-medium text-[#667085]">
        {cats.map((c) => (
          <Link
            key={c.slug}
            href={`/categoria/${c.slug}`}
            className="whitespace-nowrap transition hover:text-slate-900"
          >
            {c.label}
          </Link>
        ))}
      </Container>
    </div>
  );
}
