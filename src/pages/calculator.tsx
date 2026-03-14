import { useState, useRef, useCallback, useEffect } from "react";
import { useCreateItem, useUpdateItem } from "@/lib/storage";
import { useToast } from "@/hooks/use-toast";
import type { RawInputs } from "@/lib/types";

// ─── formatting ────────────────────────────────────────────────────────────

function fmtDisplay(raw: string): string {
  if (!raw) return "";
  const [int, dec] = raw.split(".");
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dec !== undefined ? `${formatted}.${dec}` : formatted;
}

function stripCommas(s: string): string {
  return s.replace(/,/g, "").replace(/[^\d.]/g, "");
}

function n(raw: string): number {
  return parseFloat(raw.replace(/,/g, "")) || 0;
}

function aed(val: number): string {
  return "AED " + val.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function aedSigned(val: number): string {
  const sign = val < 0 ? "−" : "";
  return `${sign}AED ${Math.abs(val).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(val: number): string {
  return val.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
}

// ─── constants ─────────────────────────────────────────────────────────────

const AGENCY_FEE_PCT   = 0.02;
const AGENCY_VAT_PCT   = 0.05;
const DLD_FEE_PCT      = 0.04;
const TRUSTEE_FEE_FLAT = 4_200;
const MORTGAGE_REG_PCT = 0.0025;

const DEFAULTS = {
  bankProcFee: "10395",
  valuationFee: "3150",
  nocFee: "1050",
  serviceFee: "6000",
} as const;

const TIERS = [
  { label: "Breakeven",    minProfit: 0,       maxProfit: 300_000,  targetProfit: 0,       color: "text-slate-500",   activeColor: "text-slate-700", bg: "bg-slate-50 dark:bg-slate-800/40",   activeBg: "bg-slate-100 dark:bg-slate-800",           ring: "ring-slate-400",  desc: "Zero profit" },
  { label: "Conservative", minProfit: 300_000, maxProfit: 500_000,  targetProfit: 300_000, color: "text-blue-500",    activeColor: "text-blue-600",  bg: "bg-blue-50 dark:bg-blue-950/40",     activeBg: "bg-blue-100 dark:bg-blue-900/60",          ring: "ring-blue-500",   desc: "AED 300K profit" },
  { label: "Moderate",     minProfit: 500_000, maxProfit: 800_000,  targetProfit: 500_000, color: "text-emerald-600", activeColor: "text-emerald-700", bg: "bg-green-50 dark:bg-green-950/40", activeBg: "bg-emerald-100 dark:bg-emerald-900/60",    ring: "ring-emerald-500", desc: "AED 500K profit" },
  { label: "Ambitious",    minProfit: 800_000, maxProfit: Infinity, targetProfit: 800_000, color: "text-amber-500",   activeColor: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/40",   activeBg: "bg-amber-100 dark:bg-amber-900/60",        ring: "ring-amber-500",  desc: "AED 800K profit" },
];

function getActiveTier(profit: number): string | null {
  if (profit < 0) return null;
  for (const t of TIERS) {
    if (profit >= t.minProfit && profit < t.maxProfit) return t.label;
  }
  return "Ambitious";
}

// ─── inputs ────────────────────────────────────────────────────────────────

function NumberInput({
  value, onChange, placeholder, className,
}: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = stripCommas(e.target.value);
    onChange(raw);
  }
  return (
    <input
      type="text"
      inputMode="decimal"
      value={fmtDisplay(value)}
      onChange={handleChange}
      placeholder={placeholder ?? "0"}
      className={className}
    />
  );
}

function AEDInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-semibold select-none">AED</span>
      <NumberInput
        value={value}
        onChange={onChange}
        placeholder={placeholder ?? "0"}
        className="w-full rounded-xl border border-input bg-background pl-14 pr-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
      />
    </div>
  );
}

function AEDRowInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative flex-1 min-w-0">
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-semibold select-none">AED</span>
      <NumberInput
        value={value}
        onChange={onChange}
        placeholder={placeholder ?? "0"}
        className="w-full rounded-xl border border-input bg-background pl-12 pr-2 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
      />
    </div>
  );
}

// ─── cost items ────────────────────────────────────────────────────────────

interface InvoiceAttachment {
  id: string;
  name: string;
  dataUrl: string;
}

interface CostItem {
  id: string;
  label: string;
  amount: string;
  scanning: boolean;
  invoices: InvoiceAttachment[];
}

function newCostItem(): CostItem {
  return { id: crypto.randomUUID(), label: "", amount: "", scanning: false, invoices: [] };
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ScanButton({ scanning, onClick }: { scanning: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={scanning}
      className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border border-input bg-background text-muted-foreground active:bg-muted transition disabled:opacity-50" title="Scan invoice">
      {scanning ? (
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )}
    </button>
  );
}

// ─── editable row ──────────────────────────────────────────────────────────

function EditableAutoRow({
  label, sub, value, onChange, isEditing, onEdit, onDone, onReset, isOverridden,
}: {
  label: string;
  sub?: string;
  value: string;
  onChange: (v: string) => void;
  isEditing: boolean;
  onEdit: () => void;
  onDone: () => void;
  onReset?: () => void;
  isOverridden?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    onEdit();
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  if (isEditing) {
    return (
      <div className="flex items-center justify-between gap-2 py-2.5">
        {label && (
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
            <span className="text-sm text-foreground">{label}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          {onReset && (
            <button type="button" onClick={() => { onReset(); onDone(); }}
              className="text-[11px] text-primary font-bold px-2.5 py-1.5 rounded-lg bg-primary/10 active:opacity-70 transition whitespace-nowrap">
              Reset
            </button>
          )}
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-semibold">AED</span>
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              value={fmtDisplay(value)}
              onChange={e => onChange(stripCommas(e.target.value))}
              onKeyDown={e => e.key === "Enter" && onDone()}
              className="w-32 rounded-xl border-2 border-primary bg-background pl-10 pr-2 py-1.5 text-sm text-right text-foreground focus:outline-none transition"
            />
          </div>
          <button type="button" onClick={onDone}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-primary text-primary-foreground active:opacity-80 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-2.5 gap-2">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOverridden ? "bg-amber-400" : "bg-emerald-400"}`} />
        <div className="flex flex-wrap items-baseline gap-x-1.5 min-w-0">
          {label && <span className="text-sm text-foreground whitespace-nowrap">{label}</span>}
          {sub && !isOverridden && <span className="text-[11px] text-muted-foreground whitespace-nowrap">{sub}</span>}
          {isOverridden && <span className="text-[10px] font-bold text-amber-500 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded-full">edited</span>}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-sm font-semibold tabular-nums text-foreground text-right">{aed(n(value))}</span>
        <button type="button" onClick={startEdit}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground active:opacity-70 transition" title="Edit">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── section label ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-black tracking-[0.18em] text-muted-foreground uppercase">{children}</p>;
}

// ─── main component ────────────────────────────────────────────────────────

export default function Calculator({ loadData, editingId, onLoadComplete }: { loadData?: RawInputs | null; editingId?: number | null; onLoadComplete?: () => void }) {
  const [name, setName] = useState("");

  const [propertyPrice, setPropertyPrice] = useState("");
  const [bankProcFee, setBankProcFee]     = useState("");
  const [valuationFee, setValuationFee]   = useState("");
  const [nocFee, setNocFee]               = useState("");
  const [serviceFee, setServiceFee]       = useState("");
  const [feesPopulated, setFeesPopulated] = useState(false);

  // Auto-populate preset fees the first time a property price is entered
  useEffect(() => {
    if (n(propertyPrice) > 0 && !feesPopulated) {
      setBankProcFee(DEFAULTS.bankProcFee);
      setValuationFee(DEFAULTS.valuationFee);
      setNocFee(DEFAULTS.nocFee);
      setServiceFee(DEFAULTS.serviceFee);
      setFeesPopulated(true);
    }
  }, [propertyPrice, feesPopulated]);

  const [showAdvanced,   setShowAdvanced]   = useState(false);
  const [mouPrice,       setMouPrice]       = useState("");
  const [bankValuation,  setBankValuation]  = useState("");
  const [gapPaymentOvr,  setGapPaymentOvr]  = useState<string | null>(null);

  const [agencyFeeOvr,   setAgencyFeeOvr]   = useState<string | null>(null);
  const [dldFeeOvr,      setDldFeeOvr]      = useState<string | null>(null);
  const [trusteeFeeOvr,  setTrusteeFeeOvr]  = useState<string | null>(null);
  const [mortgageRegOvr, setMortgageRegOvr] = useState<string | null>(null);

  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [renoItems, setRenoItems] = useState<CostItem[]>([newCostItem()]);
  const [salePrice, setSalePrice] = useState("");
  const [downPct, setDownPct]     = useState("20");
  const [localEditingId, setLocalEditingId] = useState<number | null>(null);

  // Mortgage interest tracker (informational only — does not affect profit)
  const [showMortgageTracker,     setShowMortgageTracker]     = useState(false);
  const [mortgageRate,            setMortgageRate]            = useState("");
  const [mortgageMonthlyPayment,  setMortgageMonthlyPayment]  = useState("");
  const [mortgagePaymentsMade,    setMortgagePaymentsMade]    = useState("");

  const { toast } = useToast();
  const createItem = useCreateItem();
  const updateItem = useUpdateItem();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const savingRef = useRef(false);

  // ── derived acquisition ────────────────────────────────────────────────
  const propPrice      = n(propertyPrice);
  const mouPriceN      = showAdvanced && mouPrice      ? n(mouPrice)      : propPrice;
  const bankValN       = showAdvanced && bankValuation ? n(bankValuation) : propPrice;
  const gapPaymentCalc = showAdvanced && propPrice > 0 && bankValN > 0 ? Math.max(0, propPrice - bankValN) : 0;
  const gapPaymentN    = showAdvanced ? (gapPaymentOvr !== null ? n(gapPaymentOvr) : gapPaymentCalc) : 0;

  const agencyFeeCalc   = propPrice * AGENCY_FEE_PCT * (1 + AGENCY_VAT_PCT);
  const dldFeeCalc      = mouPriceN * DLD_FEE_PCT;
  const trusteeFeeCalc  = propPrice > 0 ? TRUSTEE_FEE_FLAT : 0;
  const downFrac        = Math.min(100, Math.max(0, parseFloat(downPct) || 20)) / 100;
  const loanAmount      = bankValN * (1 - downFrac);
  const mortgageRegCalc = loanAmount * MORTGAGE_REG_PCT;

  const agencyFee   = agencyFeeOvr   !== null ? n(agencyFeeOvr)   : agencyFeeCalc;
  const dldFee      = dldFeeOvr      !== null ? n(dldFeeOvr)      : dldFeeCalc;
  const trusteeFee  = trusteeFeeOvr  !== null ? n(trusteeFeeOvr)  : trusteeFeeCalc;
  const mortgageReg = mortgageRegOvr !== null ? n(mortgageRegOvr) : mortgageRegCalc;

  const manualAcq    = propPrice > 0 ? n(bankProcFee) + n(valuationFee) + n(nocFee) + n(serviceFee) : 0;
  const propertyBase = showAdvanced ? bankValN : propPrice;
  const acqTotal     = propertyBase + gapPaymentN + agencyFee + dldFee + trusteeFee + mortgageReg + manualAcq;

  // ── derived reno & totals ──────────────────────────────────────────────
  const renoTotal  = renoItems.reduce((s, i) => s + n(i.amount), 0);
  const totalCost  = acqTotal + renoTotal;
  const sale       = n(salePrice);
  const profit     = sale - totalCost;
  const profitPct  = totalCost ? (profit / totalCost) * 100 : 0;
  const roi        = totalCost ? (profit / totalCost) * 100 : 0;
  const hasCosts   = totalCost > 0;
  const hasBoth    = hasCosts && sale > 0;
  const profitable = profit >= 0;
  const activeTier = hasBoth ? getActiveTier(profit) : null;

  // ── mortgage return ────────────────────────────────────────────────────
  const downPayment    = propertyBase * downFrac;
  const cashOut        = downPayment + gapPaymentN + agencyFee + dldFee + trusteeFee + mortgageReg + manualAcq + renoTotal;
  const mortgageRoiPct = cashOut > 0 ? (profit / cashOut) * 100 : 0;

  // ── mortgage interest tracker — amortization-based (informational) ────
  const mortgageCalc = (() => {
    const N       = parseInt(mortgagePaymentsMade) || 0;
    const P       = n(mortgageMonthlyPayment);
    const annRate = parseFloat(mortgageRate) || 0;
    if (!showMortgageTracker || annRate <= 0 || N <= 0 || P <= 0 || loanAmount <= 0)
      return { valid: false, interestPaid: 0, principalPaid: 0, totalPaid: 0, remainingBalance: loanAmount };
    const r       = annRate / 100 / 12;
    const factor  = Math.pow(1 + r, N);
    const remaining   = Math.max(0, loanAmount * factor - P * (factor - 1) / r);
    const totalPaid   = P * N;
    const principalPaid = Math.max(0, loanAmount - remaining);
    const interestPaid  = Math.max(0, totalPaid - principalPaid);
    return { valid: true, interestPaid, principalPaid, totalPaid, remainingBalance: remaining };
  })();

  // ── handlers ──────────────────────────────────────────────────────────
  const updateRenoItem = useCallback((id: string, patch: Partial<CostItem>) =>
    setRenoItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i)), []);

  const removeRenoItem = useCallback((id: string) =>
    setRenoItems(prev => prev.length > 1 ? prev.filter(i => i.id !== id) : prev), []);

  const addInvoice = useCallback((id: string, inv: InvoiceAttachment) =>
    setRenoItems(prev => prev.map(i => i.id === id ? { ...i, invoices: [...i.invoices, inv] } : i)), []);

  const removeInvoice = useCallback((itemId: string, invId: string) =>
    setRenoItems(prev => prev.map(i => i.id === itemId ? { ...i, invoices: i.invoices.filter(v => v.id !== invId) } : i)), []);

  const handleScan = useCallback(async (id: string, file: File) => {
    updateRenoItem(id, { scanning: true });
    try {
      const dataUrl = await fileToDataUrl(file);
      const base64 = dataUrl.split(",")[1];
      const res = await fetch("/api/extract-amount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      if (!res.ok) throw new Error("Failed");
      const { amount } = await res.json() as { amount: number };
      addInvoice(id, { id: crypto.randomUUID(), name: file.name || `invoice-${Date.now()}.jpg`, dataUrl });
      if (amount > 0) {
        updateRenoItem(id, { amount: amount.toString(), scanning: false });
        toast({ title: `Scanned: ${aed(amount)}`, description: "Invoice photo saved" });
      } else {
        updateRenoItem(id, { scanning: false });
        toast({ title: "Invoice photo saved", description: "Couldn't read amount — enter manually" });
      }
    } catch {
      updateRenoItem(id, { scanning: false });
      toast({ title: "Scan failed", description: "Enter amount manually", variant: "destructive" });
    }
  }, [updateRenoItem, addInvoice, toast]);

  const handleAttach = useCallback(async (id: string, file: File) => {
    const dataUrl = await fileToDataUrl(file);
    addInvoice(id, { id: crypto.randomUUID(), name: file.name || `invoice-${Date.now()}.jpg`, dataUrl });
    toast({ title: "Invoice attached" });
  }, [addInvoice, toast]);

  // Populate all fields from a saved rawInputs snapshot (edit flow)
  useEffect(() => {
    if (!loadData) return;
    setName(loadData.name);
    setPropertyPrice(loadData.propertyPrice);
    setMouPrice(loadData.mouPrice);
    setBankValuation(loadData.bankValuation);
    setShowAdvanced(loadData.showAdvanced);
    setGapPaymentOvr(loadData.gapPaymentOvr);
    setAgencyFeeOvr(loadData.agencyFeeOvr);
    setDldFeeOvr(loadData.dldFeeOvr);
    setTrusteeFeeOvr(loadData.trusteeFeeOvr);
    setMortgageRegOvr(loadData.mortgageRegOvr);
    setBankProcFee(loadData.bankProcFee);
    setValuationFee(loadData.valuationFee);
    setNocFee(loadData.nocFee);
    setServiceFee(loadData.serviceFee);
    setDownPct(loadData.downPaymentPct);
    setRenoItems(loadData.renoItems.length > 0
      ? loadData.renoItems.map(i => ({ ...i, scanning: false, invoices: (i as CostItem).invoices ?? [] }))
      : [newCostItem()]);
    setSalePrice(loadData.salePrice);
    // Capture the editing ID now — onLoadComplete will clear it from the parent
    if (editingId) setLocalEditingId(editingId);
    setFeesPopulated(true);
    onLoadComplete?.();
  }, [loadData]); // eslint-disable-line react-hooks/exhaustive-deps

  function resetForm() {
    setName(""); setPropertyPrice(""); setBankProcFee(""); setValuationFee(""); setNocFee(""); setServiceFee(""); setFeesPopulated(false);
    setMouPrice(""); setBankValuation(""); setGapPaymentOvr(null); setShowAdvanced(false);
    setAgencyFeeOvr(null); setDldFeeOvr(null); setTrusteeFeeOvr(null); setMortgageRegOvr(null);
    setRenoItems([newCostItem()]); setSalePrice(""); setDownPct("20");
    setLocalEditingId(null);
  }

  async function handleSave() {
    if (savingRef.current) return;
    if (!name.trim()) { toast({ title: "Enter a property name", variant: "destructive" }); return; }
    if (!propPrice || !sale) { toast({ title: "Enter property price and sale price", variant: "destructive" }); return; }
    savingRef.current = true;
    const activeId = editingId || localEditingId;
    try {
      const validReno = renoItems.filter(i => i.label.trim() && n(i.amount) > 0);
      const rawInputs: RawInputs = {
        name: name.trim(),
        propertyPrice,
        mouPrice,
        bankValuation,
        showAdvanced,
        gapPaymentOvr,
        agencyFeeOvr,
        dldFeeOvr,
        trusteeFeeOvr,
        mortgageRegOvr,
        bankProcFee,
        valuationFee,
        nocFee,
        serviceFee,
        downPaymentPct: downPct,
        renoItems: renoItems.map(({ id, label, amount }) => ({ id, label, amount })),
        salePrice,
      };
      const itemData = {
        name: name.trim(),
        acquisitionCost: acqTotal,
        renovationCost: renoTotal || undefined,
        costItems: validReno.length > 0 ? validReno.map(i => ({ label: i.label.trim(), amount: n(i.amount) })) : undefined,
        salePrice: sale,
        rawInputs,
      };
      if (activeId) {
        await updateItem.mutateAsync({ id: activeId, data: itemData });
        toast({ title: "Property updated!" });
        resetForm();
      } else {
        const created = await createItem.mutateAsync({ data: itemData });
        setLocalEditingId(created.id);
        toast({ title: "Property saved!", description: "Keep editing or tap 'New Property' to start fresh." });
      }
    } finally {
      savingRef.current = false;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 pb-28">

      {/* ── HERO HEADER ── */}
      <div className="bg-gradient-to-b from-slate-900 via-slate-850 to-slate-800 dark:from-slate-950 dark:to-slate-900 px-5 pt-10 pb-10">
        <div className="max-w-md mx-auto">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] font-black tracking-[0.2em] text-emerald-400 uppercase">Dubai Real Estate</p>
                <h1 className="text-xl font-black text-white leading-tight">Profit Calculator</h1>
              </div>
            </div>
            <div className="mt-1 bg-white/8 border border-white/15 rounded-xl px-3 py-1.5">
              <span className="text-white/70 text-xs font-bold">AED</span>
            </div>
          </div>

          {/* Live profit preview */}
          {hasBoth && (
            <div className={`mt-5 rounded-2xl p-4 border ${
              profitable
                ? "bg-emerald-500/15 border-emerald-400/25"
                : "bg-red-500/15 border-red-400/25"
            }`}>
              <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${profitable ? "text-emerald-400" : "text-red-400"}`}>
                {profitable ? "Live Profit" : "Loss"}
              </p>
              <p className={`text-3xl font-black tabular-nums mt-1 ${profitable ? "text-emerald-300" : "text-red-300"}`}>
                {profitable
                  ? aed(profit)
                  : `−AED ${Math.abs(profit).toLocaleString("en-AE", { maximumFractionDigits: 0 })}`}
              </p>
              <div className="flex gap-3 mt-2">
                <span className={`text-sm font-bold tabular-nums ${profitable ? "text-emerald-400" : "text-red-400"}`}>
                  ROI {pct(roi)}
                </span>
                <span className="text-white/20 font-bold">·</span>
                <span className={`text-sm font-bold tabular-nums ${profitable ? "text-emerald-400" : "text-red-400"}`}>
                  Cash-on-Cash {pct(mortgageRoiPct)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div className="flex flex-col gap-3 px-4 -mt-4 max-w-md mx-auto">

        {/* ─────────────────────────────────────────────────────── */}
        {/* Card: Property Details                                  */}
        {/* ─────────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm overflow-hidden">

          {/* Property name */}
          <div className="px-4 pt-5 pb-3">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Property name"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
            />
          </div>

          {/* Purchase Price — big */}
          <div className="px-4 pb-4">
            <label className="block text-[10px] font-black tracking-[0.18em] text-muted-foreground uppercase mb-2">Purchase Price</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-muted-foreground select-none">AED</span>
              <NumberInput
                value={propertyPrice}
                onChange={setPropertyPrice}
                placeholder="0"
                className="w-full rounded-2xl border-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 pl-16 pr-4 py-4 text-2xl font-black text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary dark:focus:border-primary transition"
              />
            </div>
          </div>

          {/* Advanced pricing toggle */}
          <div className="px-4 pb-4">
            <button type="button"
              onClick={() => setShowAdvanced(v => !v)}
              className="flex items-center justify-between w-full active:opacity-70 transition">
              <span className="text-xs font-bold text-primary">Different MOU / bank valuation?</span>
              {/* Toggle pill */}
              <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${showAdvanced ? "bg-primary" : "bg-slate-200 dark:bg-slate-600"}`}>
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${showAdvanced ? "translate-x-5" : "translate-x-0"}`} />
              </span>
            </button>

            {/* Advanced panel */}
            {showAdvanced && (
              <div className="mt-3 rounded-2xl border-2 border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-950/20 p-4 flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-amber-400/20 rounded-lg flex items-center justify-center">
                    <svg className="w-3 h-3 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">Advanced Pricing</p>
                </div>

                {/* MOU Price */}
                <div>
                  <label className="text-[11px] font-bold text-amber-700 dark:text-amber-400 block mb-1.5">MOU Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-600/60 text-xs font-bold select-none">AED</span>
                    <NumberInput value={mouPrice} onChange={setMouPrice} placeholder="4,990,000"
                      className="w-full rounded-xl border border-amber-200 dark:border-amber-700/40 bg-white dark:bg-amber-950/30 pl-12 pr-3 py-2.5 text-sm font-semibold text-foreground placeholder:text-amber-300/60 focus:outline-none focus:ring-2 focus:ring-amber-400 transition" />
                  </div>
                  <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-1">DLD 4% fee billed on this</p>
                </div>

                {/* Bank Valuation */}
                <div>
                  <label className="text-[11px] font-bold text-amber-700 dark:text-amber-400 block mb-1.5">Bank Valuation</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-600/60 text-xs font-bold select-none">AED</span>
                    <NumberInput value={bankValuation} onChange={setBankValuation} placeholder="4,950,000"
                      className="w-full rounded-xl border border-amber-200 dark:border-amber-700/40 bg-white dark:bg-amber-950/30 pl-12 pr-3 py-2.5 text-sm font-semibold text-foreground placeholder:text-amber-300/60 focus:outline-none focus:ring-2 focus:ring-amber-400 transition" />
                  </div>
                  <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-1">Down payment & mortgage reg basis</p>
                </div>

                {/* Gap Payment */}
                <div>
                  <label className="text-[11px] font-bold text-amber-700 dark:text-amber-400 block mb-1">Gap Payment</label>
                  <EditableAutoRow
                    label=""
                    sub="actual − bank val"
                    value={gapPaymentOvr !== null ? gapPaymentOvr : gapPaymentCalc.toFixed(2)}
                    onChange={v => setGapPaymentOvr(v)}
                    isEditing={!!editing["gapPayment"]}
                    onEdit={() => {
                      setEditing(e => ({ ...e, gapPayment: true }));
                      if (gapPaymentOvr === null) setGapPaymentOvr(gapPaymentCalc.toFixed(2));
                    }}
                    onDone={() => setEditing(e => ({ ...e, gapPayment: false }))}
                    onReset={() => setGapPaymentOvr(null)}
                    isOverridden={gapPaymentOvr !== null}
                  />
                  <p className="text-[10px] text-amber-600 dark:text-amber-500">Cash above bank val paid to seller</p>
                </div>
              </div>
            )}
          </div>

          {/* Acquisition Fees */}
          <div className="border-t border-slate-100 dark:border-slate-700/60">
            <div className="px-4 pt-4 pb-2">
              <SectionLabel>Acquisition Fees</SectionLabel>
            </div>

            <div className="px-4 pb-4">
              {/* Auto-computed fees */}
              {([
                { key: "agencyFee",   label: "Agency Fee",    sub: showAdvanced ? "2% + 5% VAT (actual)" : "2% + 5% VAT",                                     val: agencyFee,   ovr: agencyFeeOvr,   setOvr: setAgencyFeeOvr },
                { key: "dldFee",      label: "DLD Fee",       sub: showAdvanced && mouPrice ? "4% of MOU price" : "4%",                                         val: dldFee,      ovr: dldFeeOvr,      setOvr: setDldFeeOvr },
                { key: "trusteeFee",  label: "Trustee Fee",   sub: "flat",                                                                                      val: trusteeFee,  ovr: trusteeFeeOvr,  setOvr: setTrusteeFeeOvr },
                { key: "mortgageReg", label: "Mortgage Reg.", sub: showAdvanced && bankValuation ? "0.25% of bank val. loan" : "0.25% of loan",                  val: mortgageReg, ovr: mortgageRegOvr, setOvr: setMortgageRegOvr },
              ] as const).map(({ key, label, sub, val, ovr, setOvr }) => (
                <EditableAutoRow
                  key={key}
                  label={label}
                  sub={sub}
                  value={ovr !== null ? ovr : val.toFixed(2)}
                  onChange={v => setOvr(v)}
                  isEditing={!!editing[key]}
                  onEdit={() => {
                    setEditing(e => ({ ...e, [key]: true }));
                    if (ovr === null) setOvr(val.toFixed(2));
                  }}
                  onDone={() => setEditing(e => ({ ...e, [key]: false }))}
                  onReset={() => setOvr(null)}
                  isOverridden={ovr !== null}
                />
              ))}

              <div className="h-px bg-slate-100 dark:bg-slate-700/60 my-1" />

              {/* Preset fees */}
              <div className="rounded-xl bg-slate-50 dark:bg-slate-700/30 px-1 py-1">
              {([
                { key: "bankProc",   label: "Bank Processing",   value: bankProcFee,  set: setBankProcFee },
                { key: "valuation",  label: "Valuation Fee",     value: valuationFee, set: setValuationFee },
                { key: "noc",        label: "NOC Fee",            value: nocFee,       set: setNocFee },
                { key: "serviceFee", label: "Service Fee Prov.",  value: serviceFee,   set: setServiceFee },
              ] as const).map(({ key, label, value, set }) => (
                <EditableAutoRow
                  key={key}
                  label={label}
                  value={value}
                  onChange={set}
                  isEditing={!!editing[key]}
                  onEdit={() => setEditing(e => ({ ...e, [key]: true }))}
                  onDone={() => setEditing(e => ({ ...e, [key]: false }))}
                />
              ))}
              </div>

              {/* Total Acquisition */}
              <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-700/40 px-4 py-3 border border-slate-200/60 dark:border-slate-600/40">
                <span className="text-sm font-bold text-foreground">Total Acquisition</span>
                <span className={`text-base font-black tabular-nums ${propPrice > 0 ? "text-foreground" : "text-muted-foreground"}`}>{aed(acqTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────── */}
        {/* Card: Renovation Costs                                  */}
        {/* ─────────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Renovation Costs</SectionLabel>
            {renoTotal > 0 && (
              <span className="text-xs font-bold text-primary tabular-nums bg-primary/10 px-2.5 py-1 rounded-full">
                {aed(renoTotal)}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {renoItems.map((item, idx) => (
              <div key={item.id} className="flex flex-col gap-1.5">
                {/* Input row */}
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={item.label}
                    onChange={e => updateRenoItem(item.id, { label: e.target.value })}
                    placeholder={`Item ${idx + 1}`}
                    className="w-24 shrink-0 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
                  />
                  <AEDRowInput value={item.amount} onChange={v => updateRenoItem(item.id, { amount: v })} />
                  {/* Camera: scan + save photo */}
                  <ScanButton scanning={item.scanning} onClick={() => fileInputRefs.current[`${item.id}-scan`]?.click()} />
                  <input
                    ref={el => { fileInputRefs.current[`${item.id}-scan`] = el; }}
                    type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleScan(item.id, f); e.target.value = ""; }}
                  />
                  {/* Paperclip: attach extra photos (no OCR) */}
                  <button type="button" onClick={() => fileInputRefs.current[`${item.id}-attach`]?.click()}
                    className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border border-input bg-background text-muted-foreground active:bg-muted transition"
                    title="Attach invoice photo">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  </button>
                  <input
                    ref={el => { fileInputRefs.current[`${item.id}-attach`] = el; }}
                    type="file" accept="image/*" multiple className="hidden"
                    onChange={e => { Array.from(e.target.files || []).forEach(f => handleAttach(item.id, f)); e.target.value = ""; }}
                  />
                  {renoItems.length > 1 && (
                    <button type="button" onClick={() => removeRenoItem(item.id)}
                      className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-destructive active:opacity-70 transition">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {/* Invoice thumbnails */}
                {item.invoices.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pl-1 pb-1">
                    {item.invoices.map(inv => (
                      <div key={inv.id} className="relative shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600">
                        <img src={inv.dataUrl} alt="Invoice" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-end justify-between p-1 bg-gradient-to-t from-black/60 to-transparent">
                          <button type="button" onClick={() => window.open(inv.dataUrl, "_blank")}
                            className="w-7 h-7 bg-white/90 rounded-lg flex items-center justify-center active:opacity-70" title="View full size">
                            <svg className="w-3.5 h-3.5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </button>
                          <button type="button" onClick={() => removeInvoice(item.id, inv.id)}
                            className="w-7 h-7 bg-white/90 rounded-lg flex items-center justify-center active:opacity-70" title="Remove">
                            <svg className="w-3.5 h-3.5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <button type="button" onClick={() => setRenoItems(prev => [...prev, newCostItem()])}
            className="mt-3 flex items-center gap-1.5 text-sm text-primary font-bold py-1 active:opacity-70 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Add cost item
          </button>
        </div>

        {/* ─────────────────────────────────────────────────────── */}
        {/* Card: Sale Price + Save                                 */}
        {/* ─────────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm p-4">

          {hasCosts && (
            <div className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-700/40 border border-slate-200/60 dark:border-slate-600/40 px-4 py-2.5 mb-4">
              <span className="text-xs font-semibold text-muted-foreground">Total Cost</span>
              <span className="text-sm font-black text-foreground tabular-nums">{aed(totalCost)}</span>
            </div>
          )}

          <label className="block text-[10px] font-black tracking-[0.18em] text-muted-foreground uppercase mb-2">Sale Price</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-muted-foreground select-none">AED</span>
            <NumberInput
              value={salePrice}
              onChange={setSalePrice}
              placeholder="0"
              className="w-full rounded-2xl border-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 pl-16 pr-4 py-4 text-2xl font-black text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 mb-4">Target selling price</p>

          <button type="button" onClick={handleSave} disabled={createItem.isPending || updateItem.isPending}
            className="w-full bg-primary text-primary-foreground rounded-2xl py-4 text-sm font-black tracking-wide active:opacity-90 transition disabled:opacity-50 shadow-lg shadow-primary/20">
            {(createItem.isPending || updateItem.isPending)
              ? ((editingId || localEditingId) ? "Updating…" : "Saving…")
              : ((editingId || localEditingId) ? "Update Property" : "Save Property")}
          </button>
          {localEditingId && (
            <button type="button" onClick={resetForm}
              className="w-full mt-2 py-3 text-sm font-bold text-muted-foreground active:opacity-60 transition">
              + New Property
            </button>
          )}
        </div>

        {/* ─────────────────────────────────────────────────────── */}
        {/* Results Card — gradient hero                            */}
        {/* ─────────────────────────────────────────────────────── */}
        {hasBoth && (
          <div className="rounded-2xl overflow-hidden shadow-xl">

            {/* Main gradient */}
            <div className={`px-5 py-6 ${profitable
              ? "bg-gradient-to-br from-emerald-500 via-emerald-500 to-emerald-600"
              : "bg-gradient-to-br from-red-500 via-red-500 to-red-600"}`}>
              <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.2em]">
                {profitable ? "Your Profit" : "Your Loss"}
              </p>
              <p className="text-4xl font-black text-white tabular-nums mt-1 leading-none">
                {profitable
                  ? aed(profit)
                  : `−AED ${Math.abs(profit).toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
              </p>

              {/* ROI metrics */}
              <div className="flex gap-2 mt-5">
                <div className="flex-1 bg-black/15 rounded-xl p-3">
                  <p className="text-white/60 text-[9px] font-black uppercase tracking-widest">Total ROI</p>
                  <p className="text-white text-xl font-black tabular-nums mt-1">{pct(roi)}</p>
                  <p className="text-white/40 text-[10px] mt-0.5 tabular-nums">of {aed(totalCost)}</p>
                </div>
                <div className="flex-1 bg-black/15 rounded-xl p-3">
                  <p className="text-white/60 text-[9px] font-black uppercase tracking-widest">Cash-on-Cash</p>
                  <p className="text-white text-xl font-black tabular-nums mt-1">{pct(mortgageRoiPct)}</p>
                  <p className="text-white/40 text-[10px] mt-0.5 tabular-nums">of {aed(cashOut)}</p>
                </div>
              </div>
            </div>

            {/* Footer strip */}
            <div className={`flex px-5 py-3 ${profitable ? "bg-emerald-700" : "bg-red-700"}`}>
              <div className="flex-1">
                <p className="text-white/50 text-[9px] font-black uppercase tracking-widest">Sale Price</p>
                <p className="text-white text-sm font-black tabular-nums mt-0.5">{aed(sale)}</p>
              </div>
              <div className="w-px bg-white/20 mx-4" />
              <div className="flex-1">
                <p className="text-white/50 text-[9px] font-black uppercase tracking-widest">Total Cost</p>
                <p className="text-white text-sm font-black tabular-nums mt-0.5">{aed(totalCost)}</p>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────── */}
        {/* Price Targets                                           */}
        {/* ─────────────────────────────────────────────────────── */}
        {hasCosts && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm p-4">
            <SectionLabel>Price Targets</SectionLabel>

            <div className="flex flex-col gap-2 mt-3">
              {TIERS.map(tier => {
                const tierPrice      = totalCost + tier.targetProfit;
                const tierProfit     = tier.targetProfit;
                const tierProfitPct  = totalCost ? (tierProfit / totalCost) * 100 : 0;
                const isActive       = activeTier === tier.label;
                const displayProfit    = isActive ? profit    : tierProfit;
                const displayProfitPct = isActive ? profitPct : tierProfitPct;
                const displayPositive  = displayProfit > 0;

                return (
                  <button key={tier.label} onClick={() => setSalePrice(tierPrice.toString())}
                    className={`w-full flex items-center justify-between rounded-xl px-4 py-3.5 border-2 transition active:opacity-80
                      ${isActive
                        ? `${tier.activeBg} border-current ${tier.ring} ring-2 shadow-sm`
                        : `${tier.bg} border-transparent`}`}>
                    <div className="flex flex-col items-start gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-black ${isActive ? tier.activeColor : tier.color}`}>{tier.label}</span>
                        {isActive && (
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${tier.activeBg} ${tier.activeColor} border border-current`}>
                            YOUR PRICE
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {isActive ? `Selling at ${aed(sale)}` : `Sell at ${aed(tierPrice)}`}
                      </span>
                      {isActive && tier.targetProfit > 0 && (
                        <span className={`text-[10px] ${tier.color} opacity-70`}>
                          {tier.label === "Ambitious" ? "800K+ target" : `${tier.targetProfit >= 1_000_000 ? (tier.targetProfit / 1_000_000).toFixed(1) + "M" : (tier.targetProfit / 1_000) + "K"}+ target`}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className={`text-sm font-black tabular-nums ${displayPositive ? tier.color : "text-muted-foreground"}`}>
                        {displayPositive
                          ? `AED ${displayProfit.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`
                          : displayProfit === 0 ? "AED 0" : `−AED ${Math.abs(displayProfit).toLocaleString("en-AE", { maximumFractionDigits: 0 })}`}
                      </span>
                      <span className={`text-xs font-bold tabular-nums ${displayPositive ? tier.color : "text-muted-foreground"}`}>
                        {displayPositive ? `+${pct(displayProfitPct)}` : pct(displayProfitPct)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {!activeTier && hasBoth && (
              <p className="text-xs text-destructive mt-3 text-center font-bold">Below breakeven — selling at a loss</p>
            )}
            {!hasBoth && (
              <p className="text-xs text-muted-foreground mt-3 text-center">Enter a sale price to see your tier</p>
            )}
          </div>
        )}

        {/* ─────────────────────────────────────────────────────── */}
        {/* Cash Out of Pocket                                      */}
        {/* ─────────────────────────────────────────────────────── */}
        {hasCosts && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm overflow-hidden">

            {/* Header */}
            <div className="px-4 py-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60">
              <div>
                <SectionLabel>Cash Out of Pocket</SectionLabel>
                <p className="text-[11px] text-muted-foreground mt-0.5">Every dirham you personally spend</p>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-700/40 border border-slate-200/60 dark:border-slate-600/40 rounded-xl px-3 py-2">
                <input
                  type="number" inputMode="decimal" value={downPct}
                  onChange={e => setDownPct(e.target.value)} min={1} max={100}
                  className="w-9 text-center text-sm font-black text-foreground bg-transparent focus:outline-none"
                />
                <span className="text-xs font-bold text-muted-foreground">% down</span>
              </div>
            </div>

            {/* Bank mortgage note */}
            {propPrice > 0 && (
              <div className="mx-4 mt-4 flex items-center justify-between rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-800/30 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-400" />
                  <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">Bank finances (mortgage)</span>
                </div>
                <span className="text-sm font-black text-blue-700 dark:text-blue-400 tabular-nums">{aed(loanAmount)}</span>
              </div>
            )}

            {/* Itemized rows */}
            <div className="px-4 pt-4 pb-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Your share — line by line</p>

              {/* Down payment */}
              <div className="flex justify-between items-center py-2.5 border-b border-slate-100 dark:border-slate-700/50">
                <div>
                  <p className="text-sm font-semibold text-foreground">Down Payment</p>
                  <p className="text-[11px] text-muted-foreground">
                    {Math.round(downFrac * 100)}% of {showAdvanced && bankValuation ? "bank valuation" : "property price"}
                  </p>
                </div>
                <span className="text-sm font-bold text-foreground tabular-nums">{aed(downPayment)}</span>
              </div>

              {/* Gap payment */}
              {gapPaymentN > 0 && (
                <div className="flex justify-between items-center py-2.5 border-b border-slate-100 dark:border-slate-700/50">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Gap Payment</p>
                    <p className="text-[11px] text-muted-foreground">extra cash to seller (actual − bank val)</p>
                  </div>
                  <span className="text-sm font-bold text-foreground tabular-nums">{aed(gapPaymentN)}</span>
                </div>
              )}

              {/* Acquisition fees */}
              {[
                { label: "Agency Fee",        sub: "2% + 5% VAT",       val: agencyFee,       show: propPrice > 0 },
                { label: "DLD Fee",           sub: "4% of price",        val: dldFee,          show: propPrice > 0 },
                { label: "Trustee Fee",       sub: "flat DLD fee",       val: trusteeFee,      show: propPrice > 0 },
                { label: "Mortgage Reg.",     sub: "0.25% of loan",      val: mortgageReg,     show: propPrice > 0 },
                { label: "Bank Processing",   sub: "bank charge",        val: n(bankProcFee),  show: n(bankProcFee) > 0 },
                { label: "Valuation Fee",     sub: "bank valuation",     val: n(valuationFee), show: n(valuationFee) > 0 },
                { label: "NOC Fee",           sub: "developer fee",      val: n(nocFee),       show: n(nocFee) > 0 },
                { label: "Service Fee Prov.", sub: "maintenance est.",   val: n(serviceFee),   show: n(serviceFee) > 0 },
              ].filter(r => r.show).map(({ label, sub, val }) => (
                <div key={label} className="flex justify-between items-center py-2.5 border-b border-slate-100 dark:border-slate-700/50">
                  <div>
                    <p className="text-sm text-foreground">{label}</p>
                    <p className="text-[11px] text-muted-foreground">{sub}</p>
                  </div>
                  <span className="text-sm font-medium text-foreground tabular-nums">{aed(val)}</span>
                </div>
              ))}

              {/* Renovation items */}
              {renoItems.filter(i => n(i.amount) > 0).map(item => (
                <div key={item.id} className="flex justify-between items-center py-2.5 border-b border-slate-100 dark:border-slate-700/50">
                  <div>
                    <p className="text-sm text-foreground">{item.label || "Renovation item"}</p>
                    <p className="text-[11px] text-muted-foreground">renovation cost</p>
                  </div>
                  <span className="text-sm font-medium text-foreground tabular-nums">{aed(n(item.amount))}</span>
                </div>
              ))}
            </div>

            {/* Total row — dark */}
            <div className="mx-4 mb-4 flex items-center justify-between rounded-2xl bg-slate-900 dark:bg-white/8 px-5 py-4">
              <div>
                <p className="text-white/60 text-[10px] font-black uppercase tracking-widest">Total Out of Pocket</p>
                <p className="text-[11px] text-white/40 mt-0.5">What you personally spend</p>
              </div>
              <span className="text-xl font-black text-white tabular-nums">{aed(cashOut)}</span>
            </div>

            {/* Return on cash */}
            {hasBoth && cashOut > 0 && (
              <div className={`mx-4 mb-4 rounded-2xl p-4 ${profitable ? "bg-primary/8" : "bg-destructive/8"}`}>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Return on Your Cash</p>
                <div className="flex items-end justify-between mt-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Profit</p>
                    <p className={`text-2xl font-black tabular-nums ${profitable ? "text-primary" : "text-destructive"}`}>
                      {aedSigned(profit)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground mb-0.5">Cash-on-Cash</p>
                    <p className={`text-2xl font-black tabular-nums ${profitable ? "text-primary" : "text-destructive"}`}>
                      {pct(mortgageRoiPct)}
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Cash invested: <span className="font-bold text-foreground tabular-nums">{aed(cashOut)}</span>
                  {" "}(down{gapPaymentN > 0 ? " + gap" : ""} + fees + reno)
                </p>
              </div>
            )}
          </div>
        )}

        {/* ─────────────────────────────────────────────────────── */}
        {/* Mortgage Interest Tracker (informational)              */}
        {/* ─────────────────────────────────────────────────────── */}
        {propPrice > 0 && loanAmount > 0 && (
          <div className="mx-4 mb-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden border border-slate-200/60 dark:border-slate-700/40">
            <button
              type="button"
              onClick={() => setShowMortgageTracker(v => !v)}
              className="flex items-center justify-between w-full px-4 py-4 active:opacity-70 transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-500/10 rounded-xl flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-foreground">Mortgage Interest Tracker</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Informational only — does not affect profit</p>
                </div>
              </div>
              <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${showMortgageTracker ? "bg-blue-500" : "bg-slate-200 dark:bg-slate-600"}`}>
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ${showMortgageTracker ? "translate-x-5" : "translate-x-0"}`} />
              </span>
            </button>

            {showMortgageTracker && (
              <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-700/50">
                <div className="mt-3 mb-4 flex items-center justify-between rounded-xl bg-blue-50 dark:bg-blue-950/20 px-3 py-2.5">
                  <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">Loan Amount</span>
                  <span className="text-sm font-black tabular-nums text-blue-700 dark:text-blue-400">{aed(loanAmount)}</span>
                </div>

                <div className="flex flex-col gap-3">
                  <div>
                    <label className="block text-[10px] font-black tracking-[0.15em] uppercase text-muted-foreground mb-1.5">Annual Interest Rate</label>
                    <div className="relative">
                      <input
                        type="number" inputMode="decimal" step="0.01" min={0} max={30}
                        value={mortgageRate}
                        onChange={e => setMortgageRate(e.target.value)}
                        placeholder="e.g. 4.5"
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 pl-3 pr-8 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-blue-400 transition"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">%</span>
                    </div>
                  </div>

                  {/* Monthly payment + payments made */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-black tracking-[0.15em] uppercase text-muted-foreground mb-1.5">Monthly Payment</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">AED</span>
                        <NumberInput
                          value={mortgageMonthlyPayment}
                          onChange={setMortgageMonthlyPayment}
                          placeholder="0"
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 pl-10 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-blue-400 transition"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black tracking-[0.15em] uppercase text-muted-foreground mb-1.5">Payments Made</label>
                      <input
                        type="number" inputMode="numeric" min={1} max={600}
                        value={mortgagePaymentsMade}
                        onChange={e => setMortgagePaymentsMade(e.target.value)}
                        placeholder="e.g. 12"
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-blue-400 transition"
                      />
                    </div>
                  </div>

                  {/* Result */}
                  {mortgageCalc.valid && (
                    <div className="rounded-2xl bg-blue-500 p-4 mt-1">
                      <p className="text-blue-100 text-[10px] font-black uppercase tracking-widest mb-1">Interest Paid So Far</p>
                      <p className="text-white text-2xl font-black tabular-nums">{aed(mortgageCalc.interestPaid)}</p>
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        <div className="bg-white/10 rounded-xl p-2 text-center">
                          <p className="text-blue-100 text-[9px] font-black uppercase tracking-wide">Principal</p>
                          <p className="text-white text-xs font-black tabular-nums mt-0.5">{aed(mortgageCalc.principalPaid)}</p>
                        </div>
                        <div className="bg-white/10 rounded-xl p-2 text-center">
                          <p className="text-blue-100 text-[9px] font-black uppercase tracking-wide">Total Paid</p>
                          <p className="text-white text-xs font-black tabular-nums mt-0.5">{aed(mortgageCalc.totalPaid)}</p>
                        </div>
                        <div className="bg-white/10 rounded-xl p-2 text-center">
                          <p className="text-blue-100 text-[9px] font-black uppercase tracking-wide">Remaining</p>
                          <p className="text-white text-xs font-black tabular-nums mt-0.5">{aed(mortgageCalc.remainingBalance)}</p>
                        </div>
                      </div>
                      <p className="text-blue-200 text-[10px] mt-2 text-center">{mortgagePaymentsMade} payments × {mortgageRate}% p.a.</p>
                    </div>
                  )}

                  {!mortgageCalc.valid && (
                    <p className="text-[11px] text-muted-foreground text-center py-2">Enter rate, monthly payment &amp; number of payments to calculate</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
