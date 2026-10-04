// Local build (Phase 2): "@nexum/web" resolves here, so the local workspace contains no snapshot code.
// Same exports as client.ts; never called (every caller checks SNAPSHOT first).
export interface SnapshotInfo { version: string; built_utc: string; world: string; world_version: number }
const off = () => { throw new Error("online snapshot not available in the local build"); };
export const snapshotFetch = (_url: string, _init?: RequestInit): Promise<Response> => off();
export const snapshotInfo = (): Promise<SnapshotInfo> => off();
export const onSnapshot = (_f: (i: SnapshotInfo, newer: SnapshotInfo | null) => void): (() => void) => () => {};
export const requestPersist = async (): Promise<boolean | null> => null;
export const safariEviction = (): boolean => false;
export const ageText = (_b: string, _n?: number): string => "";
