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
}

export interface Listing {
  items: Item[];
  used: number;
  free: number;
}
