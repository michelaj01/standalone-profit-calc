export interface InvoiceAttachment {
  id: string;
  name: string;
  dataUrl: string;
}

export interface CostItem {
  id: string;
  label: string;
  amount: string;
  invoices?: InvoiceAttachment[];
}

export interface RawInputs {
  name: string;
  propertyPrice: string;
  mouPrice: string;
  bankValuation: string;
  showAdvanced: boolean;
  gapPaymentOvr: string | null;
  agencyFeeOvr: string | null;
  dldFeeOvr: string | null;
  trusteeFeeOvr: string | null;
  mortgageRegOvr: string | null;
  bankProcFee: string;
  valuationFee: string;
  nocFee: string;
  serviceFeeToSeller: string;
  serviceFeeToDev: string;
  includeServiceFee: boolean;
  sellerNocFee: string;
  downPaymentPct: string;
  renoItems: CostItem[];
  salePrice: string;
}

export interface Item {
  id: number;
  name: string;
  acquisitionCost: number;
  renovationCost: number;
  costItems: { label: string; amount: number }[];
  totalCost: number;
  salePrice: number;
  profit: number;
  profitMargin: number;
  roi: number;
  notes?: string;
  rawInputs?: RawInputs;
  createdAt: string;
}

export interface CreateItemRequest {
  name: string;
  acquisitionCost: number;
  renovationCost?: number;
  costItems?: { label: string; amount: number }[];
  salePrice: number;
  rawInputs?: RawInputs;
}
