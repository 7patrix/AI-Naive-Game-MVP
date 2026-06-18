import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "./env";

export const storageClient = new S3Client({
  endpoint: env.S3_INTERNAL_ENDPOINT,
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY
  },
  forcePathStyle: env.S3_FORCE_PATH_STYLE
});

type UploadObjectInput = {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
};

export async function uploadObject({ key, body, contentType }: UploadObjectInput) {
  await storageClient.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType
    })
  );

  return {
    key,
    url: `${env.S3_PUBLIC_BASE_URL}/${key}`
  };
}
