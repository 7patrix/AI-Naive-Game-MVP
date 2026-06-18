import { env } from "./env";

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export function hasModelConfig() {
  return Boolean(env.OPENAI_API_KEY);
}

async function complete(messages: ChatMessage[]) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const response = await fetch(`${env.OPENAI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.MODEL_NAME,
      messages,
      temperature: 0.4
    })
  });

  if (!response.ok) {
    throw new Error(`Model API request failed: ${response.status}`);
  }

  const payload = (await response.json()) as ChatCompletionResponse;
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Model API returned an empty response.");
  }

  return content;
}

export async function completeText(system: string, user: string) {
  return complete([
    { role: "system", content: system },
    { role: "user", content: user }
  ]);
}

export async function completeJson<T>(system: string, user: string) {
  const content = await completeText(system, user);
  const match = content.match(/```json\s*([\s\S]*?)```/) ?? content.match(/(\{[\s\S]*\})/);
  const json = match?.[1] ?? match?.[0] ?? content;
  return JSON.parse(json) as T;
}
