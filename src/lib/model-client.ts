import { env } from "./env";
import { outboundFetch } from "./outbound-fetch";

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

type ResponsesApiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;
};
type VisionInput = {
  dataUrl: string;
};

export function hasModelConfig() {
  return Boolean(env.OPENAI_API_KEY);
}

async function complete(messages: ChatMessage[]) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  if (env.MODEL_WIRE_API === "responses") {
    return completeWithResponsesApi(messages);
  }

  return completeWithChatCompletions(messages);
}

async function completeWithChatCompletions(messages: ChatMessage[]) {
  const response = await outboundFetch(`${env.OPENAI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
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
    const detail = await response.text().catch(() => "");
    throw new Error(`Model API request failed: ${response.status}${detail ? ` ${detail.slice(0, 240)}` : ""}`);
  }

  const payload = (await response.json()) as ChatCompletionResponse;
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Model API returned an empty response.");
  }

  return content;
}

async function completeWithResponsesApi(messages: ChatMessage[]) {
  const input = messages
    .map((message) => `${message.role === "system" ? "System" : "User"}:\n${message.content}`)
    .join("\n\n");
  const response = await outboundFetch(`${env.OPENAI_BASE_URL.replace(/\/$/, "")}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.MODEL_NAME,
      input
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Model Responses API request failed: ${response.status}${detail ? ` ${detail.slice(0, 240)}` : ""}`);
  }

  const payload = (await response.json()) as ResponsesApiResponse;
  const content =
    payload.output_text ??
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .map((item) => item.text)
      .filter((text): text is string => Boolean(text))
      .join("\n");

  if (!content) {
    throw new Error("Model Responses API returned an empty response.");
  }

  return content;
}

export async function completeText(system: string, user: string) {
  return complete([
    { role: "system", content: system },
    { role: "user", content: user }
  ]);
}

export async function completeVisionText(prompt: string, image: VisionInput) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  if (env.MODEL_WIRE_API !== "responses") {
    throw new Error("Vision input requires MODEL_WIRE_API=responses.");
  }

  const response = await outboundFetch(`${env.OPENAI_BASE_URL.replace(/\/$/, "")}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.MODEL_NAME,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: image.dataUrl }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Vision API request failed: ${response.status}${detail ? ` ${detail.slice(0, 240)}` : ""}`);
  }

  const payload = (await response.json()) as ResponsesApiResponse;
  const content =
    payload.output_text ??
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .map((item) => item.text)
      .filter((text): text is string => Boolean(text))
      .join("\n");

  if (!content) {
    throw new Error("Vision API returned an empty response.");
  }

  return content;
}

export async function completeJson<T>(system: string, user: string) {
  const content = await completeText(system, user);
  const match = content.match(/```json\s*([\s\S]*?)```/) ?? content.match(/(\{[\s\S]*\})/);
  const json = match?.[1] ?? match?.[0] ?? content;
  return JSON.parse(json) as T;
}
