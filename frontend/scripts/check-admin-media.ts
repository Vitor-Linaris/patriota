/**
 * Fails if any admin screen points an <img> or <video> straight at a
 * media URL instead of going through the admin proxy.
 *
 * Run with `npm run check:admin-media`. A plain Node script rather than
 * a spec because the frontend has no test runner — same reasoning as
 * tree-utils.check.ts next door.
 *
 * Why this exists, and it is worth being blunt about it: media became
 * private-until-published, and a browser loading `<img src>` sends no
 * Authorization header while the admin's session cookie lives on a
 * different origin from the API. So every admin surface that renders a
 * media URL directly shows a broken image until whatever it belongs to
 * is published — which is the whole time anybody is working on it.
 *
 * That was fixed once for the media library, and then found again in
 * the article editor, the article list, the article preview, the ad
 * manager and the profile avatar — five more places, each discovered by
 * somebody noticing a broken picture. It is not a thing to remember. It
 * is a thing to check.
 *
 * The rule: inside the admin, an image source must be wrapped in
 * `adminMediaUrl()` (any URL, public or private) or `mediaPreviewUrl()`
 * (when the visibility is genuinely known). Both are in lib/media-preview.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["src/app/admin", "src/components/admin"];
const SAFE = ["adminMediaUrl", "mediaPreviewUrl"];

/** How far past `src={` to look for the wrapper call. */
const LOOKAHEAD = 400;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

interface Offence {
  file: string;
  line: number;
  text: string;
}

const offences: Offence[] = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const source = readFileSync(file, "utf8");

    // Every `src={...}` on an img or video. A `src="/literal/path"` is
    // fine by definition — it is not a media URL — so only the
    // expression form is examined.
    const re = /\bsrc=\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const window = source.slice(m.index, m.index + LOOKAHEAD);
      // Stop at the closing brace of the attribute so a wrapper used in
      // a LATER attribute cannot vouch for this one.
      const expr = window.slice(0, window.indexOf("}") + 1) || window;
      if (SAFE.some((fn) => expr.includes(fn))) continue;

      // A value already built by a safe call and held in a local
      // variable is fine — checked where it is assigned.
      const name = expr.match(/src=\{([A-Za-z_$][\w$]*)\}/)?.[1];
      if (name) {
        const assigned = new RegExp(
          `(?:const|let)\\s+${name}\\s*=[^;]*(?:${SAFE.join("|")})`,
        );
        if (assigned.test(source)) continue;
      }

      // Explicit escape, for a value made safe in another file — a
      // server component that mapped it before handing it down. It
      // demands a reason on the line, so the next person can tell a
      // considered exemption from a forgotten one.
      const before = source.slice(0, m.index);
      // A few lines of headroom: the tag name, other attributes and an
      // eslint-disable usually sit between the comment and the src.
      const nearby = before.split("\n").slice(-8).join("\n");
      if (/media-proxy-ok:\s*\S/.test(nearby)) continue;

      const line = source.slice(0, m.index).split("\n").length;
      offences.push({
        file: relative(process.cwd(), file).replace(/\\/g, "/"),
        line,
        text: expr.split("\n")[0]!.trim(),
      });
    }
  }
}

if (offences.length > 0) {
  console.error(
    "\nAdmin image sources that do not go through the media proxy:\n",
  );
  for (const o of offences) {
    console.error(`  ${o.file}:${o.line}  ${o.text}`);
  }
  console.error(
    "\nWrap the URL in adminMediaUrl() from @/lib/media-preview.",
    "\nMedia is private until whatever uses it is published, and an",
    "\n<img> pointed at the API carries no session — so this renders a",
    "\nbroken image for the entire time somebody is working on it.\n",
  );
  process.exit(1);
}

console.log(
  `check-admin-media: ok — every admin image source goes through the proxy.`,
);
