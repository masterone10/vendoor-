import React from 'react';
import {
  AlertTriangle,
  RotateCw,
  Layers,
  ChevronLeft,
  Clock,
} from 'lucide-react';
import { DashboardStats } from '../types';

interface DashboardViewProps {
  stats: DashboardStats | null;
  selectedDate: string;
  onFilterStatus: (status: string) => void;
  onFilterConfirmationAge?: (category: string) => void;
  onNavigateToPrintedTab: (subTab: 'all' | 'no_extra_phone' | 'multi_merchant' | 'low_delivery' | 'pending_validation' | 'unknown_delivery') => void;
  onNavigateToPending?: () => void;
  onNavigateToProcessing?: () => void;
  onNavigateToAlerts: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  selectedDate,
  onFilterStatus,
  onNavigateToPrintedTab,
  onNavigateToPending,
  onNavigateToProcessing,
  onNavigateToAlerts,
}) => {
  if (!stats) {
    return (
      <div className="p-8 flex items-center justify-center text-slate-500">
        <div className="flex items-center gap-2">
          <RotateCw className="w-5 h-5 animate-spin text-amber-500" />
          <span>جاري تحميل المؤشرات الحية...</span>
        </div>
      </div>
    );
  }

  const { currentCounts, riskIndicators } = stats;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <span>لوحة المؤشرات والعمليات</span>
          </h2>
        </div>
      </div>

      {/* 1. Primary Status Cards (Five Essential Business Groups + Canceled) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-amber-500" />
            <span>حالات الطلبات الأساسية {stats.isToday ? '(الطلبات الحالية في النظام)' : `(نهاية يوم ${selectedDate})`}</span>
          </h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* 1. New */}
          <button
            onClick={() => onFilterStatus('New')}
            className="text-right p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/60 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-medium text-slate-300">أوردر جديد</span>
              <span className="text-[11px] font-mono text-slate-500">New</span>
            </div>
            <div className="text-2xl font-bold font-mono text-slate-100 group-hover:text-amber-400 transition-colors">
              {currentCounts.New}
            </div>
            <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
              <span>طلب جديد</span>
              <ChevronLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
            </div>
          </button>

          {/* 2. Pending */}
          <button
            onClick={() => onFilterStatus('Pending')}
            className="text-right p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/30 hover:bg-slate-800/60 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-amber-400 mb-2">
              <span className="font-medium">معلق</span>
              <span className="text-[11px] font-mono text-slate-500">Pending</span>
            </div>
            <div className="text-2xl font-bold font-mono text-amber-400">
              {currentCounts.Pending}
            </div>
            <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
              <span>يحتاج متابعة</span>
              <ChevronLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
            </div>
          </button>

          {/* 3. Processing */}
          <button
            onClick={() => onFilterStatus('Processing')}
            className="text-right p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-sky-500/30 hover:bg-slate-800/60 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-sky-400 mb-2">
              <span className="font-medium">قيد التنفيذ</span>
              <span className="text-[11px] font-mono text-slate-500">Processing</span>
            </div>
            <div className="text-2xl font-bold font-mono text-sky-400">
              {currentCounts.Processing}
            </div>
            <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
              <span>قيد التجهيز</span>
              <ChevronLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
            </div>
          </button>

          {/* 4. Canceling */}
          <button
            onClick={() => onFilterStatus('Canceling')}
            className="text-right p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-orange-500/30 hover:bg-slate-800/60 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-orange-400 mb-2">
              <span className="font-medium">قيد الإلغاء</span>
              <span className="text-[11px] font-mono text-slate-500">Canceling</span>
            </div>
            <div className="text-2xl font-bold font-mono text-orange-400">
              {currentCounts.Canceling || 0}
            </div>
            <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
              <span>تحت المراجعة</span>
              <ChevronLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
            </div>
          </button>

          {/* 5. Printed */}
          <button
            onClick={() => onFilterStatus('Printed')}
            className="text-right p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/30 hover:bg-slate-800/60 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-emerald-400 mb-2">
              <span className="font-medium">مطبوع / مؤكد</span>
              <span className="text-[11px] font-mono text-slate-500">Printed</span>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-400">
              {currentCounts.Printed}
            </div>
            <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
              <span>جاهز للشحن</span>
              <ChevronLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
            </div>
          </button>

          {/* 6. Canceled */}
          <button
            onClick={() => onFilterStatus('Canceled')}
            className="text-right p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-rose-500/30 hover:bg-slate-800/60 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-rose-400 mb-2">
              <span className="font-medium">ملغي نهائي</span>
              <span className="text-[11px] font-mono text-slate-500">Canceled</span>
            </div>
            <div className="text-2xl font-bold font-mono text-rose-400">
              {currentCounts.Canceled}
            </div>
            <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
              <span>طلبات ملغاة</span>
              <ChevronLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
            </div>
          </button>
        </div>
      </section>

      {/* 2. Critical Risk Indicators Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>مؤشرات المخاطر الحرجة (محرك التنبيهات المباشر)</span>
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Multi-Merchant Codes Alert */}
          <div
            onClick={() => onNavigateToPrintedTab('multi_merchant')}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              riskIndicators.multiMerchantPrinted > 0
                ? 'bg-rose-500/10 border-rose-500/40 hover:bg-rose-500/20 shadow-md shadow-rose-950/40'
                : 'bg-slate-900 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-rose-300 mb-2">
              <span className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>تعدد المخازن (Printed)</span>
              </span>
              <span className="text-[10px] text-rose-400 uppercase tracking-widest font-mono">حرج</span>
            </div>
            <div className="text-2xl font-bold font-mono text-rose-400">
              {riskIndicators.multiMerchantPrinted}
            </div>
          </div>

          {/* Missing Extra Phone */}
          <div
            onClick={() => onNavigateToPrintedTab('no_extra_phone')}
            className="p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/30 hover:bg-slate-800/60 transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-amber-400 mb-2">
              <span className="font-semibold">دون هاتف إضافي صالح</span>
              <span className="text-[10px] text-slate-500 font-mono">فئة أ</span>
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold font-mono text-amber-400">
                {riskIndicators.missingExtraPhonePrinted}
              </div>
              <span className="text-xs text-slate-400 font-mono">مؤكد</span>
              {riskIndicators.unverifiedExtraPhonePrinted > 0 && (
                <span className="text-xs text-slate-500 font-mono border-r border-slate-800 pr-2">
                  قيد الفحص: {riskIndicators.unverifiedExtraPhonePrinted}
                </span>
              )}
            </div>
          </div>

          {/* Delivery Rate < 70% */}
          <div
            onClick={() => onNavigateToPrintedTab('low_delivery')}
            className="p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-rose-500/30 hover:bg-slate-800/60 transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-rose-400 mb-2">
              <span className="font-semibold">نسبة تسليم أقل من 70%</span>
              <span className="text-[10px] text-slate-500 font-mono">فئة ج</span>
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold font-mono text-rose-400">
                {riskIndicators.lowDeliveryRatePrinted}
              </div>
              <span className="text-xs text-slate-400 font-mono">مؤكد</span>
              {riskIndicators.unknownDeliveryRatePrinted > 0 && (
                <span className="text-xs text-slate-500 font-mono border-r border-slate-800 pr-2">
                  غير معروف: {riskIndicators.unknownDeliveryRatePrinted}
                </span>
              )}
            </div>
          </div>

          {/* Open Critical Alerts */}
          <div
            onClick={onNavigateToAlerts}
            className="p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/60 transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
              <span className="font-semibold">إجمالي التنبيهات المفتوحة</span>
              <span className="text-[10px] text-slate-500 font-mono">Alerts</span>
            </div>
            <div className="text-2xl font-bold font-mono text-slate-100">
              {riskIndicators.openAlertsCount}
            </div>
          </div>
        </div>
      </section>

      {/* 3. Aging Breakdown: Pending & Processing (Critical Business Rule) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>توزيع أعمار الحالات الحرجة (حساب دقيق منفصل للمعلق والتنفيذ)</span>
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Pending Aging Card */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-sm text-slate-200">الطلبات المعلقة (Pending)</span>
              </div>
              <button
                onClick={onNavigateToPending}
                className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer font-medium"
              >
                <span>عرض التفاصيل ({stats.pendingAge?.total ?? currentCounts.Pending})</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              العمر يُحسب من <strong className="text-amber-300 font-normal">تاريخ الإنشاء الأصلي</strong> في فيندور (ثابت لا يتأثر بأي تعديل)
            </p>
            <div className="grid grid-cols-4 gap-2 pt-1 text-center">
              <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                <div className="text-[11px] text-slate-400 mb-1">أقل من يومين</div>
                <div className="font-mono font-bold text-slate-200 text-base">
                  {stats.pendingAge?.lessThanTwoDays ?? 0}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="text-[11px] text-amber-400 mb-1">2 - 4 أيام</div>
                <div className="font-mono font-bold text-amber-400 text-base">
                  {stats.pendingAge?.twoToFourDays ?? 0}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="text-[11px] text-amber-400 mb-1">4 - 5 أيام</div>
                <div className="font-mono font-bold text-amber-400 text-base">
                  {stats.pendingAge?.fourToFiveDays ?? 0}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
                <div className="text-[11px] text-rose-400 mb-1">أكثر من 5 أيام</div>
                <div className="font-mono font-bold text-rose-400 text-base">
                  {stats.pendingAge?.overFiveDays ?? 0}
                </div>
              </div>
            </div>
          </div>

          {/* Processing Aging Card */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-2">
                <RotateCw className="w-4 h-4 text-sky-400" />
                <span className="font-bold text-sm text-slate-200">طلبات قيد التنفيذ (Processing)</span>
              </div>
              <button
                onClick={onNavigateToProcessing}
                className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer font-medium"
              >
                <span>عرض التفاصيل ({stats.processingAge?.total ?? currentCounts.Processing})</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              العمر يُحسب من <strong className="text-sky-300 font-normal">آخر حركة فعلية موثقة</strong> بسجلات النظام (أو غير محدد إذا غابت)
            </p>
            <div className="grid grid-cols-4 gap-2 pt-1 text-center">
              <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                <div className="text-[11px] text-slate-400 mb-1">أقل من يومين</div>
                <div className="font-mono font-bold text-slate-200 text-base">
                  {stats.processingAge?.lessThanTwoDays ?? 0}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20">
                <div className="text-[11px] text-sky-400 mb-1">2 - 4 أيام</div>
                <div className="font-mono font-bold text-sky-400 text-base">
                  {stats.processingAge?.twoToFourDays ?? 0}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20">
                <div className="text-[11px] text-sky-400 mb-1">4 - 5 أيام</div>
                <div className="font-mono font-bold text-sky-400 text-base">
                  {stats.processingAge?.fourToFiveDays ?? 0}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
                <div className="text-[11px] text-rose-400 mb-1">أكثر من 5 أيام</div>
                <div className="font-mono font-bold text-rose-400 text-base">
                  {stats.processingAge?.overFiveDays ?? 0}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
