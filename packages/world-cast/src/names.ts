/* The role and activity names of the cast contract (index.ts explains them), apart so the validator and the contract
   test can list them. */
export const CAST_ROLES = ["lead", "worker", "design", "analyst", "postman", "operator", "unknown"] as const;
export const FIGURE_ACTIVITIES = ["working", "idle", "done", "blocked", "stale", "walking"] as const;
