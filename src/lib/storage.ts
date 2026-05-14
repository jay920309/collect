import localforage from 'localforage';

export interface Souvenir {
  id: string;
  category: string;
  name: string;
  features: string;
  date: string;
  userNote: string;
  imageUrl?: string;
  createdAt?: number;
  updatedAt?: number;
}

const STORAGE_KEY = 'souvenirs_data';

export const getSouvenirs = async (): Promise<Souvenir[]> => {
  try {
    const data = await localforage.getItem<Souvenir[]>(STORAGE_KEY);
    return data || [];
  } catch (error) {
    console.error('Failed to load souvenirs', error);
    return [];
  }
};

export const saveSouvenir = async (souvenir: Souvenir): Promise<void> => {
  try {
    const items = await getSouvenirs();
    const ts = Date.now();
    items.push({ ...souvenir, createdAt: ts, updatedAt: ts });
    await localforage.setItem(STORAGE_KEY, items);
  } catch (error) {
    console.error('Failed to save', error);
  }
};

export const updateSouvenir = async (souvenir: Souvenir): Promise<void> => {
  try {
    const items = await getSouvenirs();
    const index = items.findIndex(s => s.id === souvenir.id);
    if (index !== -1) {
      items[index] = { ...souvenir, updatedAt: Date.now() };
      await localforage.setItem(STORAGE_KEY, items);
    }
  } catch (error) {
    console.error('Failed to update', error);
  }
};

export const deleteSouvenir = async (id: string): Promise<void> => {
  try {
    let items = await getSouvenirs();
    items = items.filter(s => s.id !== id);
    await localforage.setItem(STORAGE_KEY, items);
  } catch (error) {
    console.error('Failed to delete', error);
  }
};

export const setAllSouvenirs = async (items: Souvenir[]): Promise<void> => {
  try {
    await localforage.setItem(STORAGE_KEY, items);
  } catch (e) {
    console.warn('Failed to set all items', e);
  }
};

export const getAllCategories = async (): Promise<string[]> => {
  const items = await getSouvenirs();
  const categories = new Set(items.map((i) => i.category));
  return Array.from(categories);
};
