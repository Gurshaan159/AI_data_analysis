export interface PathValidationResult {
  isValid: boolean;
  reason: string | null;
}

export interface BackendHealthInfo {
  status: "ready" | "degraded";
  aiProvider: string;
  capabilities: {
    fileDialog: boolean;
    folderDialog: boolean;
    pathValidation: boolean;
    runExecution: boolean;
    runCancellation: boolean;
    progressStreaming: boolean;
  };
}
