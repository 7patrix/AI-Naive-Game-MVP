import { z } from "zod";

export const remoteGameManifestSchema = z.object({
  schemaVersion: z.literal("1.0"),
  title: z.string(),
  entry: z.string(),
  entryUrl: z.string().url(),
  bundleUrl: z.string().url(),
  assets: z.array(z.string().url()),
  permissions: z.array(z.enum(["keyboard", "pointer", "touch"])).default(["keyboard", "pointer"]),
  supportedDevices: z.array(z.enum(["desktop", "mobile"])).default(["desktop"]),
  inputMethods: z.array(z.enum(["keyboard", "pointer", "touch"])).default(["keyboard", "pointer"]),
  orientation: z.enum(["portrait", "landscape", "any"]).default("any"),
  createdByJobId: z.string(),
  generatedAt: z.string()
});

export type RemoteGameManifest = z.infer<typeof remoteGameManifestSchema>;
