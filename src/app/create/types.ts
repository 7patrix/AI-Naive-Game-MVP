export type CreateJobStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";

export type CreateJob = {
  id: string;
  prompt: string;
  status: CreateJobStatus;
  progress: number;
  error: string | null;
  moderationStatus: string;
  estimatedCostCents: number;
  apiCredentialSource: "PLATFORM" | "USER_KEY";
  createdAt: string;
  updatedAt: string;
  logs: {
    id: string;
    agentName: string;
    step: string;
    message: string;
    createdAt: string;
  }[];
  uploads: {
    id: string;
    filename: string;
    publicUrl: string;
  }[];
  artifacts?: {
    id: string;
    type: string;
    version: number;
    publicUrl: string | null;
    createdAt: string;
  }[];
  parentGame?: {
    id: string;
    slug: string;
    title: string;
    currentVersionNumber: number;
  } | null;
  game: {
    id: string;
    slug: string;
    title: string;
    manifestUrl: string | null;
    bundleUrl: string | null;
    currentVersionNumber: number;
  } | null;
};
