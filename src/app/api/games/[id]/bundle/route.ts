import { NextResponse } from "next/server";
import { GameStatus } from "@prisma/client";
import { db } from "@/lib/db";

type GameBundleRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, { params }: GameBundleRouteProps) {
  const { id } = await params;
  const game = await db.game.findFirst({
    where: {
      id,
      status: GameStatus.PUBLISHED
    },
    select: {
      id: true,
      bundleUrl: true
    }
  });

  if (!game?.bundleUrl) {
    return NextResponse.json({ error: "Game bundle not found." }, { status: 404 });
  }

  const response = await fetch(game.bundleUrl, { cache: "no-store" });

  if (!response.ok) {
    return NextResponse.json(
      { error: `Bundle source request failed: ${response.status}` },
      { status: 502 }
    );
  }

  const sourceHtml = await response.text();
  const runtimeStyle = `<style id="ai-arcade-runtime-fit">
html, body {
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  overflow: hidden !important;
  overscroll-behavior: none !important;
}
body {
  position: relative !important;
  transform-origin: top left !important;
}
</style>`;
  const runtimeScript = `<script id="ai-arcade-runtime-fit-script">
(function () {
  function fitGameToViewport() {
    var body = document.body;
    if (!body) return;

    body.style.transform = "none";
    body.style.width = "";
    body.style.height = "";

    var viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    var viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    var contentWidth = Math.max(body.scrollWidth, document.documentElement.scrollWidth, viewportWidth);
    var contentHeight = Math.max(body.scrollHeight, document.documentElement.scrollHeight, viewportHeight);
    var scale = Math.min(viewportWidth / contentWidth, viewportHeight / contentHeight, 1);

    body.style.width = contentWidth + "px";
    body.style.height = contentHeight + "px";
    body.style.transform = "scale(" + scale + ")";
  }

  window.addEventListener("load", fitGameToViewport);
  window.addEventListener("resize", fitGameToViewport);
  window.setTimeout(fitGameToViewport, 50);
  window.setTimeout(fitGameToViewport, 300);
})();
</script>`;
  const html = sourceHtml.includes("</head>")
    ? sourceHtml.replace("</head>", `${runtimeStyle}</head>`)
    : `${runtimeStyle}${sourceHtml}`;
  const htmlWithRuntime = html.includes("</body>")
    ? html.replace("</body>", `${runtimeScript}</body>`)
    : `${html}${runtimeScript}`;

  return new NextResponse(htmlWithRuntime, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src * data: blob:; media-src *; font-src data:; connect-src 'none';"
    }
  });
}
