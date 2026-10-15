import React, { useState, useEffect, useRef } from 'react';
import { Clock, RotateCw, Search, Eye, AlertTriangle, Calendar } from 'lucide-react';
import { Order } from '../types';

interface PendingProcessingViewProps {
  statusType: 'Pending' | 'Processing';
  selectedDate?: string;
  onSelectOrder: (orderCode: string) => void;
}

export const PendingProcessingView: React.FC<PendingProcessingViewProps> = ({
  statusType,
  selectedDate,
  onSelectOrder,
}) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [totalAllCount, setTotalAllCount] = useState<number>(0);
  const [showAllDates, setShowAllDates] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [selectedAgeBucket, setSelectedAgeBucket] = useState<'all' | 'less_than_2_days' | '2_to_4_days' | '4_to_5_days' | 'over_5_days' | 'unknown'>('all');
  const [search, setSearch] = useState('');
  const activeRequestIdRef = useRef<number>(0);

  useEffect(() => {
    fetchOrders();
  }, [statusType, selectedDate, showAllDates]);

  async function fetchOrders() {
    const requestId = ++activeRequestIdRef.current;
    setLoading(true);
    try {
      const endpoint = statusType === 'Pending' ? '/api/pending' : '/api/processing';
      const params = new URLSearchParams();
      if (selectedDate && !showAllDates) {
        params.set('date', selectedDate);
      }
      if (showAllDates) {
        params.set('allDates', '1');
      }

      const res = await fetch(`${endpoint}?${params.toString()}`);
      const data = await res.json();
      // Ignore response if another request was triggered in the meantime
      if (requestId === activeRequestIdRef.current) {
        setOrders(data.orders || []);
        if (data.totalAllCount !== undefined) {
          setTotalAllCount(data.totalAllCount);
        }
      }
    } catch (err) {
      if (requestId === activeRequestIdRef.current) {
        console.error(`Error fetching ${statusType} orders:`, err);
      }
    } finally {
      if (requestId === activeRequestIdRef.current) {
        setLoading(false);
      }
    }
  }

  // Count by age bucket - exact mutually exclusive boundaries
  const bucketCounts = {
    all: orders.length,
    less_than_2_days: orders.filter(o => o.ageBucket === 'less_than_2_days').length,
    '2_to_4_days': orders.filter(o => o.ageBucket === '2_to_4_days').length,
    '4_to_5_days': orders.filter(o => o.ageBucket === '4_to_5_days').length,
    over_5_days: orders.filter(o => o.ageBucket === 'over_5_days').length,
    unknown: orders.filter(o => o.ageBucket === 'unknown').length,
  };

  const filtered = orders.filter((o) => {
    if (selectedAgeBucket !== 'all' && o.ageBucket !== selectedAgeBucket) {
      return false;
    }
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.random_number.toLowerCase().includes(q) ||
      o.customer_phone.includes(q) ||
      (o.customer_name && o.customer_name.toLowerCase().includes(q))
    );
  });

  const isPending = statusType === 'Pending';

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            {isPending ? (
              <>
                <Clock className="w-5 h-5 text-amber-400" />
                <span>الطلبات المعلقة (Pending)</span>
              </>
            ) : (
              <>
                <RotateCw className="w-5 h-5 text-sky-400" />
                <span>طلبات قيد التنفيذ (Processing)</span>
              </>
            )}
            <span
              className={`text-xs font-mono font-semibold px-2 py-0.5 rounded border ${
                isPending
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                  : 'bg-sky-500/10 border-sky-500/20 text-sky-400'
              }`}
            >
              {orders.length} طلب
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isPending
              ? 'عمر الطلب محسوب حصراً من تاريخ الإنشاء الأصلي في فيندور (ولا يتأثر بالملاحظات أو التزامن)'
              : 'عمر الحالة محسوب من تاريخ آخر حركة فعلية موثقة بسجلات النظام (مع الاحتفاظ بوصف الحركة)'}
          </p>
        </div>

        {/* Date Scope Filter Toggle */}
        {selectedDate && (
          <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400">التاريخ:</span>
            {!showAllDates ? (
              <span className="font-mono text-amber-300 font-semibold bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                {selectedDate}
              </span>
            ) : (
              <span className="text-slate-300">كافة التواريخ</span>
            )}
            <button
              onClick={() => setShowAllDates(!showAllDates)}
              className="mr-2 text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
            >
              {showAllDates ? `حصر باليوم المحدد` : `عرض الكل (${totalAllCount})`}
            </button>
          </div>
        )}

        {/* Age Buckets Filter */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-lg text-xs font-medium">
          <button
            onClick={() => setSelectedAgeBucket('all')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              selectedAgeBucket === 'all'
                ? 'bg-slate-800 text-slate-100 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            الكل ({bucketCounts.all})
          </button>
          <button
            onClick={() => setSelectedAgeBucket('less_than_2_days')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              selectedAgeBucket === 'less_than_2_days'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                : 'text-slate-400 hover:text-emerald-400'
            }`}
          >
            أقل من يومين ({bucketCounts.less_than_2_days})
          </button>
          <button
            onClick={() => setSelectedAgeBucket('2_to_4_days')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              selectedAgeBucket === '2_to_4_days'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-slate-400 hover:text-amber-400'
            }`}
          >
            2 إلى 4 أيام ({bucketCounts['2_to_4_days']})
          </button>
          <button
            onClick={() => setSelectedAgeBucket('4_to_5_days')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              selectedAgeBucket === '4_to_5_days'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-slate-400 hover:text-amber-400'
            }`}
          >
            4 إلى 5 أيام ({bucketCounts['4_to_5_days']})
          </button>
          <button
            onClick={() => setSelectedAgeBucket('over_5_days')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              selectedAgeBucket === 'over_5_days'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 shadow-sm'
                : 'text-slate-400 hover:text-rose-400'
            }`}
          >
            أكثر من 5 أيام ({bucketCounts.over_5_days})
          </button>
          {bucketCounts.unknown > 0 && (
            <button
              onClick={() => setSelectedAgeBucket('unknown')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                selectedAgeBucket === 'unknown'
                  ? 'bg-slate-700 text-slate-200 border border-slate-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              غير محدد ({bucketCounts.unknown})
            </button>
          )}
        </div>
      </div>

      {/* Search Input */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute right-3 top-3 text-slate-500" />
          <input
            type="text"
            placeholder="بحث بالكود، الهاتف، أو اسم العميل..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pr-9 pl-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
          />
        </div>
      </div>

      {/* Orders Table */}
      <div className="border border-slate-800 rounded-xl bg-slate-900/60 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400">
                <th className="py-3 px-4 font-semibold">كود الطلب</th>
                <th className="py-3 px-4 font-semibold">العميل</th>
                <th className="py-3 px-4 font-semibold">الهاتف</th>
                <th className="py-3 px-4 font-semibold">المحافظة</th>
                <th className="py-3 px-4 font-semibold">
                  {isPending ? 'عمر الطلب (من الإنشاء)' : 'عمر الحالة (من آخر حركة)'}
                </th>
                <th className="py-3 px-4 font-semibold">
                  {isPending ? 'تاريخ الإنشاء الأصلي' : 'آخر حركة مسجلة بالسجلات'}
                </th>
                <th className="py-3 px-4 font-semibold">المخازن</th>
                <th className="py-3 px-4 font-semibold">الإجمالي</th>
                <th className="py-3 px-4 font-semibold text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    جاري تحميل الطلبات...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    لا توجد طلبات في هذا النطاق الزمني
                  </td>
                </tr>
              ) : (
                filtered.map((order) => {
                  const isCriticalAge = order.ageInDays !== null && order.ageInDays > 5;
                  const isWarningAge = order.ageInDays !== null && order.ageInDays >= 4 && order.ageInDays <= 5;

                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Random Order Code */}
                      <td className="py-3 px-4">
                        <button
                          onClick={() => onSelectOrder(order.random_number)}
                          className="font-mono font-bold text-amber-400 hover:text-amber-300 text-sm hover:underline cursor-pointer"
                        >
                          {order.random_number}
                        </button>
                      </td>

                      {/* Customer */}
                      <td className="py-3 px-4 font-medium text-slate-200">
                        {order.customer_name || 'غير محدد'}
                      </td>

                      {/* Phone */}
                      <td className="py-3 px-4 font-mono text-slate-300">
                        {order.customer_phone}
                      </td>

                      {/* Governorate */}
                      <td className="py-3 px-4 text-slate-400">
                        {order.governorate || '—'}
                      </td>

                      {/* Age in Status */}
                      <td className="py-3 px-4">
                        <span
                          className={`font-mono font-semibold ${
                            order.ageInDays === null
                              ? 'text-slate-500'
                              : isCriticalAge
                              ? 'text-rose-400'
                              : isWarningAge
                              ? 'text-amber-400'
                              : 'text-slate-300'
                          }`}
                        >
                          {order.ageInDays !== null ? `${order.ageInDays} يوم` : 'غير محدد'}
                        </span>
                      </td>

                      {/* Reference Timestamp & Audit Info */}
                      <td className="py-3 px-4 text-slate-400 text-[11px]">
                        {isPending ? (
                          <span className="font-mono">{order.created_at_source || '—'}</span>
                        ) : order.latest_action_at ? (
                          <div className="space-y-0.5">
                            <div className="font-mono text-sky-400">{order.latest_action_at}</div>
                            {order.latest_action_text && (
                              <div
                                className="text-[10px] text-slate-400 truncate max-w-xs"
                                title={`${order.latest_action_actor || ''}: ${order.latest_action_text}`}
                              >
                                {order.latest_action_actor ? `${order.latest_action_actor}: ` : ''}
                                {order.latest_action_text}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">لا توجد حركات موثقة</span>
                        )}
                      </td>

                      {/* Warehouse Codes */}
                      <td className="py-3 px-4">
                        {order.distinct_merchant_count > 1 ? (
                          <span className="text-rose-400 font-bold inline-flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>{order.distinct_merchant_count} مخازن</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">مخزن واحد</span>
                        )}
                      </td>

                      {/* Total */}
                      <td className="py-3 px-4 font-mono font-semibold text-slate-200">
                        {order.total_order} ج.م
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => onSelectOrder(order.random_number)}
                          className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
                          title="عرض التفاصيل الكاملة"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
