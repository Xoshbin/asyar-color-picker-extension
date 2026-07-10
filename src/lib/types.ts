/** One entry in the persisted pick history, newest last. */
export interface HistoryEntry {
  id: string;
  hex: string;
  r: number;
  g: number;
  b: number;
  timestamp: number;
  favorite: boolean;
}
