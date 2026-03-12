import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Item, CreateItemRequest } from "./types";

const STORAGE_KEY = "profit-calc-items";

function getItems(): Item[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveItems(items: Item[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

let nextId = 0;
function getNextId(): number {
  const items = getItems();
  const maxId = items.reduce((max, item) => Math.max(max, item.id), 0);
  nextId = Math.max(nextId, maxId) + 1;
  return nextId;
}

function createItemFromRequest(data: CreateItemRequest): Item {
  const acquisitionCost = data.acquisitionCost;
  const renovationCost = data.renovationCost ?? 0;
  const totalCost = acquisitionCost + renovationCost;
  const salePrice = data.salePrice;
  const profit = salePrice - totalCost;
  const profitMargin = salePrice !== 0 ? (profit / salePrice) * 100 : 0;
  const roi = totalCost !== 0 ? (profit / totalCost) * 100 : 0;

  return {
    id: getNextId(),
    name: data.name,
    acquisitionCost,
    renovationCost,
    costItems: data.costItems ?? [],
    totalCost,
    salePrice,
    profit,
    profitMargin,
    roi,
    createdAt: new Date().toISOString(),
  };
}

export function useListItems() {
  return useQuery<Item[]>({
    queryKey: ["items"],
    queryFn: () => getItems(),
  });
}

export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ data }: { data: CreateItemRequest }): Promise<Item> => {
      const item = createItemFromRequest(data);
      const items = getItems();
      items.push(item);
      saveItems(items);
      return item;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

export function useDeleteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: number }): Promise<{ success: boolean }> => {
      const items = getItems();
      const filtered = items.filter((item) => item.id !== id);
      saveItems(filtered);
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });
}
