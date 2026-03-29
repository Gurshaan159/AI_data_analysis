export const APP_PAGES = {
  WELCOME: "welcome",
  ESTABLISHED_ANALYSIS: "established-analysis",
  AI_ASSISTED_ANALYSIS: "ai-assisted-analysis",
  REVIEW_WORKFLOW: "review-workflow",
  RUN_ANALYSIS: "run-analysis",
} as const;

export type AppPage = (typeof APP_PAGES)[keyof typeof APP_PAGES];
