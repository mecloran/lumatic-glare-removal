export interface ImageSet {
  id: string;
  name: string;
  images: {
    clear: string | null;
    glare: string | null;
    humanEdited: string | null;
    geminiResult: string | null;
  };
}

export interface ImagesResponse {
  withReference: ImageSet[];
  withoutReference: ImageSet[];
}
