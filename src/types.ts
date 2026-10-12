export interface Idea {
  id: string;
  text: string;
  /** Children are shown (only meaningful when the idea has children) */
  open: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Board {
  id: string;
  name: string;
  ideas: Record<string, Idea>;
  /** Top-level ideas, in order */
  roots: string[];
  /** parent id -> child ids, in order */
  children: Record<string, string[]>;
  createdAt: number;
  updatedAt: number;
}

export interface Store {
  version: 1;
  boards: Board[];
  currentId: string;
}
