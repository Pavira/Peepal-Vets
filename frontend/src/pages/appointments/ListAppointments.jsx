import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardLayout from "../../app/layout/DashboardLayout";
import {
  CalendarDays,
  Eye,
  FileText,
  Hash,
  Search,
  X,
  Printer,
  Download,
} from "lucide-react";
import { getAllAppointments } from "@/services/appointment_service";
import ModuleHeader from "@/components/ui/ModuleHeader";
import LoadingOverlay from "@/components/ui/LoadingOverlay";

const TABS = ["active", "completed", "cancelled"];

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export default function ListAppointments() {
  const navigate = useNavigate();
  const apiBaseUrl = import.meta.env.VITE_API_URL || "";
  const [searchParams] = useSearchParams();
  const today = new Date().toISOString().split("T")[0];
  const customerId = searchParams.get("customerId") || "";
  const customerName = searchParams.get("customerName") || "";

  const [selectedDate, setSelectedDate] = useState(today);
  const [activeTab, setActiveTab] = useState("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfAppointment, setPdfAppointment] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const pdfIframeRef = useRef(null);

  useEffect(() => {
    fetchAppointments();
  }, [selectedDate, customerId]);

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getAllAppointments({
        date: selectedDate,
        customer_id: customerId || undefined,
        minimal: true,
      });
      setAppointments(response.appointments || []);
    } catch (err) {
      setError("Failed to load appointments.");
      console.error("Error fetching appointments:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewAppointment = (appointment) => {
    setPdfAppointment(appointment);
    setShowPdfModal(true);
    setPdfLoading(true);
  };

  const closePdfModal = () => {
    setShowPdfModal(false);
    setPdfAppointment(null);
    setPdfLoading(false);
  };

  const getDownloadDatePart = (appointment) => {
    const rawDate = appointment?.date || appointment?.created_at;
    if (!rawDate) return "unknown-date";

    const parsed = new Date(rawDate);
    if (Number.isNaN(parsed.getTime())) {
      return String(rawDate).replace(/[^\w-]/g, "-");
    }

    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, "0");
    const dd = String(parsed.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const handlePrint = async () => {
    try {
      const iframeWindow = pdfIframeRef.current?.contentWindow;
      if (!iframeWindow) {
        console.error("Prescription preview is not ready for printing.");
        return;
      }
      iframeWindow.focus();
      iframeWindow.print();
    } catch (error) {
      console.error("Error printing prescription preview:", error);
    }
  };
  const handleDownload = async () => {
    if (!pdfAppointment?.id) {
      console.error("Appointment ID not available");
      return;
    }

    try {
      const baseApi = "/api/v1";
      const pdfUrl = `${baseApi}/appointments/${pdfAppointment.id}/pdf?download=1`;
      const namePart = String(
        pdfAppointment.customerName || "prescription",
      ).replace(/[^\w-]/g, "-");
      const appointmentIdPart = pdfAppointment.id || "no-id";
      const datePart = getDownloadDatePart(pdfAppointment);

      // Format: ownername_appointmentid_date
      const filename = `${namePart}_${appointmentIdPart}_${datePart}.pdf`;

      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Error downloading PDF:", error);
    }
  };

  const counts = useMemo(
    () => ({
      active: appointments.filter(
        (item) => (item.status || "active").toLowerCase() === "active",
      ).length,
      completed: appointments.filter(
        (item) => (item.status || "active").toLowerCase() === "completed",
      ).length,
      cancelled: appointments.filter(
        (item) => (item.status || "active").toLowerCase() === "cancelled",
      ).length,
    }),
    [appointments],
  );

  const filteredAppointments = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return appointments.filter((appointment) => {
      const statusMatch =
        (appointment.status || "active").toLowerCase() === activeTab;

      if (!statusMatch) return false;
      if (!query) return true;

      const name = (appointment.customerName || "").toLowerCase();
      const phone = String(appointment.phone || "").toLowerCase();
      return name.includes(query) || phone.includes(query);
    });
  }, [appointments, activeTab, searchTerm]);

  return (
    <DashboardLayout>
      <div className="bg-white rounded-2xl shadow-lg p-4 md:p-6 relative">
        <LoadingOverlay show={loading} message="Loading appointments..." />
        <ModuleHeader
          icon={<CalendarDays size={22} />}
          title="Appointments"
          tagline={
            customerId
              ? `Appointments for ${customerName || "selected patient"}`
              : "Manage daily appointments"
          }
        />

        {/* <div className="mb-4 rounded-xl border border-purple-100 bg-purple-50 px-4 py-4">
          <label className="block text-sm font-semibold text-purple-800 mb-2">
            Filter By Date
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="w-full sm:w-72 px-4 py-2.5 border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
          />
        </div> */}
        <div className="mb-4">
          <p className="inline-flex items-center gap-2 text-sm text-purple-800 font-bold uppercase tracking-wide">
            Filter By Date -{" "}
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="w-full sm:w-72 px-4 py-2.5 border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
            />
          </p>
        </div>

        <div className="mb-6 relative">
          <Search className="absolute left-3 top-3 text-gray-400" size={20} />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by patient name or phone number..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition ${
                activeTab === tab
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {tab} ({counts[tab] || 0})
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No {activeTab} appointments for {formatDate(selectedDate)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                    <span className="inline-flex items-center gap-1">
                      <Hash size={14} />
                      S.No
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                    Owner Name
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                    Number
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                    Pet Name
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                    Species
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                    Time
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredAppointments.map((appointment, index) => (
                  <tr
                    key={appointment.id}
                    className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                    onClick={() =>
                      navigate(`/appointments/${appointment.id}`, {
                        state: { appointment, sourceTab: activeTab },
                      })
                    }
                  >
                    <td className="px-4 py-3 text-sm text-gray-700 font-medium">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-800 font-medium">
                      {appointment.customerName || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {appointment.phone || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {appointment.petName || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {appointment.petType || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {appointment.time || "-"}
                    </td>
                    <td className="px-4 py-3 text-center space-x-2">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          handleViewAppointment(appointment);
                        }}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-green-100 text-green-600 hover:bg-green-200 transition duration-150"
                        title="Prescription / PDF"
                      >
                        <FileText size={16} />
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/appointments/${appointment.id}`, {
                            state: { appointment, sourceTab: activeTab },
                          });
                        }}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 transition duration-150"
                        title="View Appointment"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Prescription Modal */}
        {showPdfModal && pdfAppointment && (
          <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-800">
                  Appointment Prescription
                </h2>
                <button
                  onClick={closePdfModal}
                  className="text-gray-400 hover:text-gray-600 transition"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="relative p-6">
                <LoadingOverlay
                  show={pdfLoading}
                  message="Loading prescription..."
                />
                <iframe
                  ref={pdfIframeRef}
                  src={`/peepalvets.html?appointment_id=${
                    pdfAppointment.id
                  }&api_base=/api/v1`}
                  title="Prescription Preview"
                  className="w-full h-[75vh] border rounded-lg bg-white"
                  onLoad={() => setPdfLoading(false)}
                />
              </div>

              {/* Modal Footer */}
              <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition"
                >
                  <Printer size={18} />
                  Print
                </button>
                {/* <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition"
                >
                  <Download size={18} />
                  Download
                </button> */}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
