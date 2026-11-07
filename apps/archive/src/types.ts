export interface Item {
  id: string;
  name: string;
  type: string;
  kind: "image" | "video";
  size: number;
  takenAt: number;
  uploadedAt: number;
  memo: string;
  thumb: boolean;
  width?: number;
  height?: number;
  folderId?: string | null;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

export interface Listing {
  items: Item[];
  folders: Folder[];
  used: number;
  free: number;
}
