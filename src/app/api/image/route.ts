import { getImageModelPrompt, getImageModelResponse } from "@/lib/image-prompt-helper";
import { ModelConfig } from "@/lib/model/model-config.type";
import { ImageModelId } from "@/lib/model/model.type";
import { imageModels } from "@/lib/model/models";
import { ratelimit } from "@/lib/rate-limiter";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { Message } from "ai/react";
import { NextRequest } from "next/server";

// IMPORTANT! Set the runtime to edge
export const runtime = "edge";

const decoder = new TextDecoder();

export async function POST(req: NextRequest) {
  const { success } = await ratelimit.limit(req.ip ?? "127.0.0.1");

  if (!success) {
    return new Response(JSON.stringify({ message: "Too many requests" }), { status: 429 });
  }

  const { modelId, messages, config } = (await req.json()) as {
    modelId: ImageModelId;
    messages: Message[];
    config?: ModelConfig;
  };

  const modelInfo = imageModels.find((m) => m.id === modelId);

  const bedrockClient = new BedrockRuntimeClient({
    region: modelInfo?.region ?? process.env.AWS_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
    },
  });

  const body = getImageModelPrompt({ modelId, messages, config });

  try {
    const bedrockResponse = await bedrockClient.send(
      new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(body),
      }),
    );

    const response = JSON.parse(decoder.decode(bedrockResponse.body));

    return new Response(JSON.stringify({ result: getImageModelResponse(modelId, response) }));
  } catch (err: any) {
    console.error(err.message);
    return Response.json({ message: err.message }, { status: err.httpStatusCode ?? 500 });
  }
}