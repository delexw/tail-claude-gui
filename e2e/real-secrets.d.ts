export const SECRET_FILES: string[];
export function realConfigRoot(): string;
export function snapshotRealSecrets(
  root?: string,
): Record<string, { exists: boolean; mtimeMs: number | null }>;
