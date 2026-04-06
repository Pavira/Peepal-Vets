import { useState, useEffect } from "react";
import ModuleHeader from "@/components/ui/ModuleHeader";
import LoadingOverlay from "@/components/ui/LoadingOverlay";
import {
  Users,
  Calendar,
  Archive,
  DollarSign,
  ArrowUpRight,
  Clock,
  Triangle,
  Sparkles,
} from "lucide-react";
import {
  getDashboardStats,
  getDashboardLowStock,
} from "@/services/dashboard_service";
import DashboardLayout from "../../app/layout/DashboardLayout";

const DASHBOARD_BANNER_URL = "/peepalvetsbanner2.png";
const DASHBOARD_ASSET_CACHE = "peepal-assets-v1";

function formatStatus(qty) {
  if (qty < 20)
    return {
      label: "Critical",
      style: "bg-red-100 text-red-700",
      icon: Triangle,
    };
  if (qty < 50)
    return {
      label: "Low",
      style: "bg-orange-100 text-orange-700",
      icon: Sparkles,
    };
  return {
    label: "OK",
    style: "bg-emerald-100 text-emerald-700",
    icon: Sparkles,
  };
}

export default function HospitalDashboard() {
  const [statsLoading, setStatsLoading] = useState(true);
  const [lowStockLoading, setLowStockLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [drugs, setDrugs] = useState([]);
  const [error, setError] = useState(null);
  const [bannerSrc, setBannerSrc] = useState(DASHBOARD_BANNER_URL);

  useEffect(() => {
    let canceled = false;
    let objectUrl = null;

    async function loadBannerFromCache() {
      if (typeof window === "undefined" || !("caches" in window)) {
        return;
      }

      try {
        const cache = await window.caches.open(DASHBOARD_ASSET_CACHE);
        let cachedResponse = await cache.match(DASHBOARD_BANNER_URL);

        if (!cachedResponse) {
          const networkResponse = await fetch(DASHBOARD_BANNER_URL);
          if (networkResponse.ok) {
            await cache.put(DASHBOARD_BANNER_URL, networkResponse.clone());
            cachedResponse = networkResponse;
          }
        }

        if (!cachedResponse) return;

        const blob = await cachedResponse.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!canceled) {
          setBannerSrc(objectUrl);
        }
      } catch (caught) {
        console.warn("Unable to cache dashboard banner:", caught);
      }
    }

    loadBannerFromCache();

    return () => {
      canceled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, []);

  useEffect(() => {
    async function loadDashboard() {
      setStatsLoading(true);
      setLowStockLoading(true);
      setError(null);

      try {
        const statsResponse = await getDashboardStats();
        if (statsResponse?.success) {
          const s = statsResponse.data;
          const totalAppointments =
            Number(s.total_appointments_active || 0) +
            Number(s.total_appointments_completed || 0) +
            Number(s.total_appointments_cancelled || 0);
          setStats([
            {
              title: "Total Patients",
              value: s.total_customers,
              icon: Users,
              trend: "+8% this week",
              trendColor: "text-emerald-500",
            },
            {
              title: "Total Appointments",
              value: totalAppointments,
              icon: Calendar,
              trend: "+4.5% this week",
              trendColor: "text-emerald-500",
            },
            {
              title: "Total Drugs",
              value: s.total_drugs,
              icon: Archive,
              trend: "+1.2% this week",
              trendColor: "text-emerald-500",
            },
            {
              title: "Total Revenue",
              value: `INR ${Number(s.total_revenue || 0).toLocaleString()}`,
              icon: DollarSign,
              trend: "+10% this week",
              trendColor: "text-emerald-500",
            },
          ]);
        } else {
          setStats([
            {
              title: "Total Patients",
              value: 0,
              icon: Users,
              trend: "-",
              trendColor: "text-slate-500",
            },
            {
              title: "Total Appointments",
              value: 0,
              icon: Calendar,
              trend: "-",
              trendColor: "text-slate-500",
            },
            {
              title: "Total Drugs",
              value: 0,
              icon: Archive,
              trend: "-",
              trendColor: "text-slate-500",
            },
            {
              title: "Total Revenue",
              value: "INR 0",
              icon: DollarSign,
              trend: "-",
              trendColor: "text-slate-500",
            },
          ]);
        }
      } catch (caught) {
        setError(caught?.message || "Failed to load dashboard stats");
      } finally {
        setStatsLoading(false);
      }

      try {
        const lowStockResponse = await getDashboardLowStock(50, 10);
        if (lowStockResponse?.success) {
          setDrugs(lowStockResponse.data);
        } else {
          setDrugs([]);
        }
      } catch (caught) {
        setError(
          (prev) => prev || caught?.message || "Failed to load low stock drugs",
        );
      } finally {
        setLowStockLoading(false);
      }
    }

    loadDashboard();
  }, []);

  const cards = stats || [
    {
      title: "Total Patients",
      value: "--",
      icon: Users,
      trend: "-",
      trendColor: "text-slate-400",
    },
    {
      title: "Total Appointments",
      value: "--",
      icon: Calendar,
      trend: "-",
      trendColor: "text-slate-400",
    },
    {
      title: "Total Drugs",
      value: "--",
      icon: Archive,
      trend: "-",
      trendColor: "text-slate-400",
    },
    {
      title: "Total Revenue",
      value: "--",
      icon: DollarSign,
      trend: "-",
      trendColor: "text-slate-400",
    },
  ];

  return (
    <DashboardLayout>
      <div className="bg-white rounded-2xl shadow-lg p-4 md:p-6 relative">
        <ModuleHeader
          icon={<Users size={22} />}
          title="Dashboard"
          tagline="Rooted in Compassion, Driven by Science"
        />
        <div className="max-w-[1300px] mx-auto space-y-6">
          <section className="rounded-2xl overflow-hidden shadow-lg shadow-purple-200/60">
            <img
              src={bannerSrc}
              alt="dashboard banner"
              className="w-full h-48 sm:h-56 lg:h-64 object-cover"
            />
          </section>

          {/* Stats cards */}
          <section>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {(statsLoading ? new Array(4).fill(0) : cards).map(
                (item, idx) => (
                  <article
                    key={item?.title ?? idx}
                    className={`rounded-xl bg-white p-5 shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-md ${
                      statsLoading ? "animate-pulse" : ""
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm uppercase tracking-wide text-slate-500">
                          {item?.title ?? "Loading"}
                        </p>
                        <p className="mt-2 text-3xl font-bold text-slate-900">
                          {statsLoading ? "--" : item.value}
                        </p>
                      </div>
                      <div className="bg-slate-100 p-2 rounded-lg text-sky-500">
                        {statsLoading ? (
                          <span className="block w-8 h-8 rounded-md bg-slate-300" />
                        ) : (
                          <item.icon className="h-6 w-6" />
                        )}
                      </div>
                    </div>
                    {!statsLoading && item.trend && (
                      <div className="mt-3 flex items-center gap-1 text-xs font-medium opacity-90">
                        <ArrowUpRight
                          className={`h-4 w-4 ${item.trendColor}`}
                        />
                        <span className={item.trendColor}>{item.trend}</span>
                      </div>
                    )}
                  </article>
                ),
              )}
            </div>
          </section>

          {/* Low stock drugs */}
          <section className="rounded-2xl bg-white p-4 sm:p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Low Stock Drugs (Qty &lt; 50)
                </h2>
                <p className="text-sm text-slate-500">Updated just now</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                <Clock className="h-4 w-4" /> real-time
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="bg-slate-100 text-xs uppercase tracking-wider text-slate-600">
                  <tr>
                    <th className="px-4 py-3 rounded-tl-lg">Drug Name</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Quantity</th>
                    <th className="px-4 py-3">Purchase Date</th>
                    <th className="px-4 py-3 rounded-tr-lg">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockLoading ? (
                    <tr>
                      <td colSpan={5}>
                        <div className="flex justify-center items-center py-12">
                          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
                        </div>
                      </td>
                    </tr>
                  ) : drugs.length === 0 ? (
                    <tr className="bg-white">
                      <td
                        className="px-4 py-5 text-center text-slate-500"
                        colSpan={5}
                      >
                        No low stock drugs found.
                      </td>
                    </tr>
                  ) : (
                    drugs.map((drug, idx) => {
                      const qty = Number(drug.quantity ?? 0);
                      const status = formatStatus(qty);
                      const StatusIcon = status.icon;

                      return (
                        <tr
                          key={drug.id || `${drug.name}-${idx}`}
                          className={`border-b hover:bg-slate-50 transition-colors duration-150 ${idx % 2 ? "bg-white" : "bg-slate-50"}`}
                        >
                          <td className="px-4 py-3 font-medium text-slate-800">
                            {drug.name}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {drug.category || "General"}
                          </td>
                          <td
                            className={`px-4 py-3 font-semibold ${qty < 20 ? "text-red-600" : qty < 50 ? "text-orange-600" : "text-slate-900"}`}
                          >
                            {qty}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {drug.lastAddedDate}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${status.style}`}
                            >
                              <StatusIcon className="mr-1 h-3.5 w-3.5" />
                              {status.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}

