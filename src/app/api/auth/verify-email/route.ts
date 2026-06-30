import { NextRequest, NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/email-verification";
import { env } from "@/lib/env";

function renderVerificationResult({
  title,
  message,
  tone
}: {
  title: string;
  message: string;
  tone: "success" | "error";
}) {
  const color = tone === "success" ? "#4f46e5" : "#dc2626";
  const loginUrl = new URL("/login", env.APP_URL).toString();

  return new NextResponse(
    `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f8fafc;
        color: #0f172a;
        font-family: Arial, "Microsoft YaHei", sans-serif;
      }
      main {
        width: min(420px, calc(100vw - 32px));
        box-sizing: border-box;
        border: 1px solid #e2e8f0;
        border-radius: 24px;
        background: #ffffff;
        padding: 32px;
        text-align: center;
        box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
      }
      .mark {
        width: 48px;
        height: 48px;
        display: inline-grid;
        place-items: center;
        border-radius: 999px;
        background: ${color};
        color: #ffffff;
        font-size: 28px;
        font-weight: 700;
      }
      h1 {
        margin: 20px 0 12px;
        font-size: 28px;
      }
      p {
        margin: 0;
        color: #475569;
        line-height: 1.7;
      }
      a {
        display: inline-block;
        margin-top: 24px;
        border-radius: 12px;
        background: #4f46e5;
        color: #ffffff;
        padding: 12px 18px;
        font-weight: 700;
        text-decoration: none;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="mark">${tone === "success" ? "✓" : "!"}</div>
      <h1>${title}</h1>
      <p>${message}</p>
      <a href="${loginUrl}">返回登录</a>
    </main>
  </body>
</html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8"
      }
    }
  );
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return renderVerificationResult({
      title: "验证链接无效",
      message: "这个邮箱验证链接缺少 token。请回到登录页重新登录，系统会重新发送验证邮件。",
      tone: "error"
    });
  }

  const result = await verifyEmailToken(token);

  if (!result.ok) {
    return renderVerificationResult({
      title: "邮箱验证失败",
      message: result.error,
      tone: "error"
    });
  }

  return renderVerificationResult({
    title: "邮箱验证成功",
    message: "你的邮箱已经验证完成。现在可以关闭这个页面，回到网站登录并继续使用 Create。",
    tone: "success"
  });
}
