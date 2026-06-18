import { z } from "zod";

export const remoteGameManifestSchema = z.object({
  schemaVersion: z.literal("1.0"),
  title: z.string(),
  entry: z.string(),
  entryUrl: z.string().url(),
  bundleUrl: z.string().url(),
  assets: z.array(z.string().url()),
  permissions: z.array(z.enum(["keyboard", "pointer"])),
  createdByJobId: z.string(),
  generatedAt: z.string()
});

export type RemoteGameManifest = z.infer<typeof remoteGameManifestSchema>;
