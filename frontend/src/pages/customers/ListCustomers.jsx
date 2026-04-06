import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import DashboardLayout from "../../app/layout/DashboardLayout";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Pencil,
  CalendarDays,
  History,
  Users,
  Hash,
  Zap,
  X,
  Eye,
  FileText,
  Image as ImageIcon,
  Printer,
} from "lucide-react";
import { getAllCustomers } from "@/services/customer_service";
import ModuleHeader from "@/components/ui/ModuleHeader";
import {
  createAppointment,
  getAllAppointments,
} from "@/services/appointment_service";
import toast from "react-hot-toast";

export default function ListCustomers() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSearchTerm, setActiveSearchTerm] = useState("");
  const [cursor, setCursor] = useState(null);
  const [cursorHistory, setCursorHistory] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasNext, setHasNext] = useState(false);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [customersPerPage] = useState(10);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const requestIdRef = useRef(0);

  const hasPrev = cursorHistory.length > 0;
  const [error, setError] = useState(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerAppointments, setCustomerAppointments] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [selectedImages, setSelectedImages] = useState([]);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchTerm.trim();
      if (trimmed.length >= 3) {
        setActiveSearchTerm(trimmed);
      } else if (trimmed.length === 0) {
        setActiveSearchTerm("");
        setCursor(null);
        setCursorHistory([]);
      } else {
        // 1-2 chars: do not modify results, do not call API
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const activeSearch = activeSearchTerm.length >= 3;

    if (!activeSearch && activeSearchTerm !== "") {
      return;
    }

    const activeCursor = cursor || undefined;

    const doFetch = async () => {
      try {
        setLoading(true);
        setError(null);

        const requestId = ++requestIdRef.current;

        const params = {
          limit: customersPerPage,
          cursor: activeCursor,
          search: activeSearch ? activeSearchTerm : undefined,
        };

        const customerResponse = await getAllCustomers(params);

        if (requestId !== requestIdRef.current) {
          return;
        }

        setCustomers(customerResponse.customers || []);
        setNextCursor(customerResponse.next_cursor || null);
        setHasNext(Boolean(customerResponse.has_next));
        setTotalCustomers(customerResponse.total ?? 0);
      } catch (err) {
        if (requestIdRef.current) {
          setError("Failed to load customers. Please try again later.");
          console.error("Error fetching customers:", err);
        }
      } finally {
        if (requestIdRef.current) {
          setLoading(false);
          setIsInitialLoad(false);
        }
      }
    };

    doFetch();
  }, [cursor, activeSearchTerm, customersPerPage]);

  const handlePrevPage = () => {
    if (cursorHistory.length > 0) {
      const previousCursor = cursorHistory[cursorHistory.length - 1];
      setCursorHistory((prev) => prev.slice(0, -1));
      setCursor(previousCursor || null);
    }
  };

  const handleNextPage = () => {
    if (hasNext && nextCursor) {
      setCursorHistory((prev) => [...prev, cursor]);
      setCursor(nextCursor);
    }
  };

  const startIndex = cursorHistory.length * customersPerPage;
  const paginatedCustomers = customers;

  const createInstantAppointment = async (customer) => {
    setActionLoading(true);
    try {
      if (!customer?.id || !customer?.name) {
        toast.error("Patient details are incomplete.");
        return;
      }

      const now = new Date();
      const payload = {
        customerId: customer.id,
        customerName: customer.name,
        phone: customer.phone || "",
        petName: customer.petName || "",
        petAgeYears: customer.petAgeYears ?? null,
        petAgeMonths: customer.petAgeMonths ?? null,
        petType: customer.petType || "",
        petSex: customer.petSex || "",
        petBreed: customer.petBreed || "",
        vaccinated: customer.vaccinated || "",
        deworming: customer.deworming || "",
        date: now.toISOString().split("T")[0],
        time: now.toTimeString().slice(0, 5),
      };

      const response = await createAppointment(payload);
      const appointmentId = response?.id || response?.appointment_id;
      if (!appointmentId) {
        toast.error("Unable to open instant appointment.");
        return;
      }

      navigate(`/appointments/${appointmentId}`);
    } catch (err) {
      console.error("Error creating instant appointment:", err);
      toast.error("Failed to create instant appointment.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRowClick = (customer) => {
    createInstantAppointment(customer);
  };

  const handleEditClick = (customerId) => {
    navigate(`/customers/${customerId}`);
  };

  const handleCalendarClick = (customer) => {
    const params = new URLSearchParams({
      customerId: customer.id || "",
      customerName: customer.name || "",
      phone: customer.phone || "",
      petName: customer.petName || "",
      petAgeYears:
        customer.petAgeYears === null || customer.petAgeYears === undefined
          ? ""
          : String(customer.petAgeYears),
      petAgeMonths:
        customer.petAgeMonths === null || customer.petAgeMonths === undefined
          ? ""
          : String(customer.petAgeMonths),
      petType: customer.petType || "",
      petSex: customer.petSex || "",
      petBreed: customer.petBreed || "",
      vaccinated: customer.vaccinated || "",
      deworming: customer.deworming || "",
    });
    navigate(`/appointments/add?${params.toString()}`);
  };

  const handleHistoryClick = async (customer) => {
    setSelectedCustomer(customer);
    setHistoryModalOpen(true);
    setHistoryLoading(true);
    setActionLoading(true);
    try {
      const response = await getAllAppointments({ customer_id: customer.id });
      setCustomerAppointments(response.appointments || []);
    } catch (err) {
      console.error("Error fetching appointments:", err);
      toast.error("Failed to load appointment history");
      setCustomerAppointments([]);
    } finally {
      setHistoryLoading(false);
      setActionLoading(false);
    }
  };

  const handleViewImages = (appointment) => {
    setSelectedImages(appointment.scannedImages || []);
    setImageModalOpen(true);
  };

  const handleViewPrescription = (appointment) => {
    setSelectedAppointment(appointment);
    setPdfModalOpen(true);
  };

  const closePdfModal = () => {
    setPdfModalOpen(false);
    setSelectedAppointment(null);
  };

  const handlePrint = async () => {
    if (!selectedAppointment?.id) {
      console.error("Appointment ID not available");
      return;
    }

    try {
      const url = `/peepalvets.html?appointment_id=${selectedAppointment.id}&print=1&api_base=/api/v1`;
      window.open(url, "_blank", "noopener");
    } catch (error) {
      console.error("Error opening prescription for printing:", error);
    }
  };

  return (
    <DashboardLayout>
      <div className="bg-white rounded-2xl shadow-lg p-4 md:p-6 relative">
        <ModuleHeader
          icon={<Users size={22} />}
          title="Patients Management"
          tagline="Manage your patients"
          action={
            <button
              onClick={() => navigate("/customers/add")}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white text-sm md:text-base font-semibold py-2 md:py-2.5 px-3 md:px-4 rounded-lg transition duration-200 shadow-md hover:shadow-lg"
            >
              <Plus size={18} />
              Add Patient
            </button>
          }
        />

        {/* <div className="mb-4">
          <p className="inline-flex items-center gap-2 text-sm text-purple-800 font-bold uppercase tracking-wide">
            <Users size={16} />
            Total Patients - {totalCustomers || customers.length}
          </p>
        </div> */}

        {/* Search Bar */}
        <div className="mb-6 relative">
          <Search className="absolute left-3 top-3 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search by owner name"
            value={searchTerm}
            onChange={(e) => {
              const value = e.target.value;
              setSearchTerm(value);
              setCursor(null);
              setCursorHistory([]);
            }}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        ) : !isInitialLoad && paginatedCustomers.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No patients found</p>
            <p className="text-gray-400 mt-2">
              {searchTerm
                ? "Try adjusting your search"
                : "Add your first patient to get started"}
            </p>
          </div>
        ) : (
          <>
            {/* Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                      <span className="inline-flex items-center gap-1">
                        {/* <Hash size={14} /> */}
                        S.No
                      </span>
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                      Owner Name
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                      Number
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                      Pet Name
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                      Species
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-gray-700">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCustomers.map((customer, index) => (
                    <tr
                      key={customer.id}
                      className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer transition duration-150"
                      onClick={() => handleRowClick(customer)}
                    >
                      <td className="px-6 py-4 text-sm text-gray-700 font-medium">
                        {startIndex + index + 1}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-800 font-medium">
                        {/* Show only 20 characters */}
                        {customer.name.length > 20
                          ? `${customer.name.substring(0, 20)}...`
                          : customer.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {customer.phone || "-"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {customer.petName || "-"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {customer.petType || "-"}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditClick(customer.id);
                            }}
                            disabled={actionLoading}
                            className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-purple-100 text-purple-600 hover:bg-purple-200 transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Edit Customer"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCalendarClick(customer);
                            }}
                            disabled={actionLoading}
                            className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Add Appointment"
                          >
                            <CalendarDays size={16} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              createInstantAppointment(customer);
                            }}
                            disabled={actionLoading}
                            className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-yellow-100 text-yellow-700 hover:bg-yellow-200 transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Instant Appointment"
                          >
                            <Zap size={16} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleHistoryClick(customer);
                            }}
                            disabled={actionLoading}
                            className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Appointment History"
                          >
                            <History size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-4">
              {paginatedCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className="bg-gray-50 rounded-2xl border border-gray-200 p-5 space-y-2"
                  onClick={() => handleRowClick(customer)}
                >
                  <div className="flex justify-between items-start gap-3">
                    <h3 className="font-semibold text-gray-800">
                      {customer.name || "-"}
                    </h3>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditClick(customer.id);
                      }}
                      className="text-purple-600 text-sm hover:underline flex items-center gap-1"
                    >
                      <Pencil size={14} />
                      Edit
                    </button>
                  </div>
                  <p className="text-sm text-gray-600">
                    Number: {customer.phone || "-"}
                  </p>
                  <p className="text-sm text-gray-600">
                    Pet Name: {customer.petName || "-"}
                  </p>
                  <p className="text-sm text-gray-600">
                    Pet Type: {customer.petType || "-"}
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCalendarClick(customer);
                      }}
                      disabled={actionLoading}
                      className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Add Appointment"
                    >
                      <CalendarDays size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        createInstantAppointment(customer);
                      }}
                      disabled={actionLoading}
                      className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-yellow-100 text-yellow-700 hover:bg-yellow-200 transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Instant Appointment"
                    >
                      <Zap size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleHistoryClick(customer);
                      }}
                      disabled={actionLoading}
                      className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Appointment History"
                    >
                      <History size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-6 pt-4 border-t border-gray-200">
              <div className="text-xs md:text-sm text-gray-600">
                Showing {customers.length > 0 ? startIndex + 1 : 0} to{" "}
                {startIndex + customers.length} patients
                {/* {totalCustomers || customers.length} patients */}
              </div>

              <div className="flex items-center gap-1 md:gap-2">
                <button
                  onClick={handlePrevPage}
                  disabled={!hasPrev}
                  className="flex items-center gap-1 px-2 md:px-3 py-1.5 md:py-2 rounded-lg border border-gray-300 text-xs md:text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150"
                >
                  <ChevronLeft size={14} />
                  Previous
                </button>

                <span className="text-xs md:text-sm text-gray-600 px-2">
                  {/* Showing {startIndex + 1} to {startIndex + customers.length} of{" "}
                  {totalCustomers} patients */}
                  Showing {customers.length > 0 ? startIndex + 1 : 0} to{" "}
                  {startIndex + customers.length} patients
                </span>

                <button
                  onClick={handleNextPage}
                  disabled={!hasNext}
                  className="flex items-center gap-1 px-2 md:px-3 py-1.5 md:py-2 rounded-lg border border-gray-300 text-xs md:text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150"
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* History Modal */}
      {historyModalOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-800">
                Appointment History - {selectedCustomer?.name}
              </h2>
              <button
                onClick={() => setHistoryModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition duration-150"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              {historyLoading ? (
                <div className="flex justify-center items-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
                </div>
              ) : customerAppointments.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500 text-lg">No appointments found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {customerAppointments.map((appointment, index) => (
                    <div
                      key={appointment.id}
                      className="bg-gray-50 rounded-xl border border-gray-200 p-4"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                        <div>
                          <span className="text-sm font-medium text-gray-500">
                            S.No
                          </span>
                          <p className="text-lg font-semibold text-gray-800">
                            {index + 1}
                          </p>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-gray-500">
                            Owner Name
                          </span>
                          <p className="text-sm text-gray-800">
                            {appointment.customerName}
                          </p>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-gray-500">
                            Doctor Fee
                          </span>
                          <p className="text-sm text-gray-800">
                            ₹{appointment.doctorFee || 0}
                          </p>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-gray-500">
                            Appointment Date
                          </span>
                          <p className="text-sm text-gray-800">
                            {appointment.date}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                        <div>
                          <span className="text-sm font-medium text-gray-500">
                            Pet Name
                          </span>
                          <p className="text-sm text-gray-800">
                            {appointment.petName || "-"}
                          </p>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-gray-500">
                            Species
                          </span>
                          <p className="text-sm text-gray-800">
                            {appointment.petType || "-"}
                          </p>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-gray-500">
                            Vaccinated
                          </span>
                          <p className="text-sm text-gray-800">
                            {appointment.vaccinated || "Not specified"}
                            {appointment.vaccinationStartDate && (
                              <span className="block text-xs text-gray-600">
                                Start: {appointment.vaccinationStartDate}
                              </span>
                            )}
                            {appointment.vaccinationEndDate && (
                              <span className="block text-xs text-gray-600">
                                End: {appointment.vaccinationEndDate}
                              </span>
                            )}
                          </p>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-gray-500">
                            Deworming
                          </span>
                          <p className="text-sm text-gray-800">
                            {appointment.deworming || "Not specified"}
                            {appointment.dewormingStartDate && (
                              <span className="block text-xs text-gray-600">
                                Start: {appointment.dewormingStartDate}
                              </span>
                            )}
                            {appointment.dewormingEndDate && (
                              <span className="block text-xs text-gray-600">
                                End: {appointment.dewormingEndDate}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleViewImages(appointment)}
                          disabled={
                            !appointment.scannedImages ||
                            appointment.scannedImages.length === 0
                          }
                          className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:bg-gray-100 disabled:text-gray-400 px-3 py-2 rounded-lg text-sm font-medium transition duration-150"
                        >
                          <ImageIcon size={16} />
                          View Images ({appointment.scannedImages?.length || 0})
                        </button>
                        <button
                          onClick={() => handleViewPrescription(appointment)}
                          className="inline-flex items-center gap-2 bg-green-100 text-green-700 hover:bg-green-200 px-3 py-2 rounded-lg text-sm font-medium transition duration-150"
                        >
                          <FileText size={16} />
                          View Prescription
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image Modal */}
      {imageModalOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-800">
                Appointment Images
              </h2>
              <button
                onClick={() => setImageModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition duration-150"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              {selectedImages.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500 text-lg">No images available</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedImages.map((imageUrl, index) => (
                    <div
                      key={index}
                      className="bg-gray-50 rounded-lg overflow-hidden"
                    >
                      <img
                        src={imageUrl}
                        alt={`Appointment image ${index + 1}`}
                        className="w-full h-64 object-cover"
                        onError={(e) => {
                          e.target.src = "/placeholder-image.png"; // Fallback image
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PDF Modal */}
      {pdfModalOpen && selectedAppointment && (
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
            <div className="p-6">
              <iframe
                src={`/peepalvets.html?appointment_id=${
                  selectedAppointment.id
                }&api_base=/api/v1`}
                title="Prescription Preview"
                className="w-full h-[75vh] border rounded-lg bg-white"
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
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
