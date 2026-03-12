export interface CostItem {
  label: string;
  amount: number;
}

export interface Item {
  id: number;
  name: string;
  acquisitionCost: number;
  renovationCost: number;
  costItems: CostItem[];
  totalCost: number;
  salePrice: number;
  profit: number;
  profitMargin: number;
  roi: number;
  notes?: string;
  createdAt: string;
}

export interface CreateItemRequest {
  name: string;
  acquisitionCost: number;
  renovationCost?: number;
  costItems?: CostItem[];
  salePrice: number;
}
