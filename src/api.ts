import { ImagesResponse } from './types';

const API_BASE = '/api';

export async function fetchImages(): Promise<ImagesResponse> {
  const response = await fetch(`${API_BASE}/images`);
  if (!response.ok) {
    throw new Error('Failed to fetch images');
  }
  return response.json();
}
