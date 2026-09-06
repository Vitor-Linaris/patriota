"use client";

import { useEffect, useRef } from "react";

/**
 * Renders arbitrary embed HTML — Google AdSense, Taboola, Outbrain, any
 * ad network's "paste this code" block — with its <script> tags
 * actually running.
 *
 * `dangerouslySetInnerHTML` (like any `innerHTML` assignment) never
 * executes a <script> tag it introduces — a DOM/browser rule that
 * predates React, not a bug specific to this site. Every ad network's
 * embed code is exactly `<ins>`/`<div>` markup PLUS one or more
 * `<script>` tags that do the actual work (load the ad library, then
 * request an ad into that markup) — so rendered as plain
 * `dangerouslySetInnerHTML`, the placeholder element appears and
 * nothing ever fills it.
 *
 * The fix is the standard one: parse the HTML into a detached
 * <template>, replace each parsed (inert) <script> with a freshly
 * created one carrying the same attributes and inline text, then
 * attach the whole thing to a real element in the document. A
 * `<script>` created via `createElement` and then attached via
 * `appendChild` DOES execute — only the ones that arrive through
 * `innerHTML` are inert. Order is preserved, so a network's follow-up
 * `<script>` (e.g. AdSense's `adsbygoogle.push({})`) still runs AFTER
 * the `<ins>` it targets, exactly as the network's own docs assume.
 *
 * A `src` already present on the page (tracked module-wide, so it
 * survives across every slot and every client-side navigation in this
 * session) is not re-inserted — several ad slots on one page each
 * pasting AdSense's full snippet would otherwise fetch
 * pagead2.googlesyndication.com's loader once per slot.
 */

const loadedScriptSrcs = new Set<string>();

export function ScriptedHtml({
  html,
  className,
  style,
}: {
  html: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const template = document.createElement("template");
    template.innerHTML = html;

    template.content.querySelectorAll("script").forEach((inertScript) => {
      const src = inertScript.getAttribute("src");
      if (src) {
        if (loadedScriptSrcs.has(src)) {
          inertScript.remove();
          return;
        }
        loadedScriptSrcs.add(src);
      }
      const liveScript = document.createElement("script");
      for (const { name, value } of Array.from(inertScript.attributes)) {
        liveScript.setAttribute(name, value);
      }
      liveScript.textContent = inertScript.textContent;
      inertScript.replaceWith(liveScript);
    });

    container.replaceChildren(template.content);

    // Nothing to clean up on unmount: a <script src> that already ran
    // (e.g. loaded the AdSense library onto `window`) has no useful
    // "undo", and loadedScriptSrcs staying populated is exactly what
    // stops the next mount of this same network's embed from
    // re-fetching it.
  }, [html]);

  return <div ref={containerRef} className={className} style={style} />;
}
