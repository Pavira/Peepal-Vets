import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../../app/layout/DashboardLayout";
import { ArrowLeft, ClipboardList, Package, Plus } from "lucide-react";
import toast from "react-hot-toast";
import { createDrug } from "@/services/drug_service";
import ModuleHeader from "@/components/ui/ModuleHeader";
import SectionHeader from "@/components/ui/SectionHeader";

const GST_OPTIONS = [0, 5, 12, 18, 28];

export default function AddDrug() {
  const navigate = useNavigate();
  const today = new Date().toISOString().split("T")[0];
  const [formData, setFormData] = useState({
    name: "",
    date: today,
    quantity: "",
    price: "",
    gstPercent: "0",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const subTotal = useMemo(
    () => Number(formData.quantity || 0) * Number(formData.price || 0),
    [formData.quantity, formData.price],
  );
  const gstAmount = useMemo(
    () => (subTotal * Number(formData.gstPercent || 0)) / 100,
    [subTotal, formData.gstPercent],
  );
  const totalAmount = useMemo(
    () => subTotal + gstAmount,
    [subTotal, gstAmount],
  );

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setErrors((prev) => ({
      ...prev,
      [name]: "",
    }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) {
      newErrors.name = "Drug name is required.";
    }

    if (!formData.date) {
      newErrors.date = "Date is required.";
    }

    if (!formData.quantity || Number(formData.quantity) <= 0) {
      newErrors.quantity = "Quantity must be greater than 0.";
    }

    if (!formData.price || Number(formData.price) <= 0) {
      newErrors.price = "Price must be greater than 0.";
    }
    if (Number(formData.gstPercent) < 0) {
      newErrors.gstPercent = "GST must be a valid percentage.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validateForm()) {
      toast.error("Please fix validation errors before submitting.");
      return;
    }

    try {
      setLoading(true);
      await createDrug({
        name: formData.name.trim(),
        date: formData.date,
        quantity: Number(formData.quantity),
        price: Number(formData.price),
        gstPercent: Number(formData.gstPercent || 0),
      });

      toast.success("Drug added successfully");
      navigate("/drugs");
    } catch (error) {
      const detail = error?.response?.data?.detail;
      if (detail === "Drug name already exists") {
        toast.error("Drug already exists. Open it from list and update stock.");
      } else {
        toast.error("Failed to add drug. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="w-full">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <ModuleHeader
            icon={<Package size={22} />}
            title="Add New Drug"
            tagline="Create a new inventory record"
            action={
              <button
                type="button"
                onClick={() => navigate("/drugs")}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg transition duration-200 shadow-md hover:shadow-lg"
              >
                <ArrowLeft size={16} />
                Back
              </button>
            }
          />

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="border-b border-gray-200 mb-3"></div>

            <div>
              <SectionHeader
                title="Drug Information"
                icon={<ClipboardList size={18} />}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label
                    htmlFor="name"
                    className="block text-sm font-semibold text-gray-700 mb-2"
                  >
                    Drug Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Enter drug name"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  />
                  {errors.name && (
                    <p className="text-sm text-red-500 mt-1">{errors.name}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="date"
                    className="block text-sm font-semibold text-gray-700 mb-2"
                  >
                    Purchase Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    id="date"
                    name="date"
                    value={formData.date}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  />
                  {errors.date && (
                    <p className="text-sm text-red-500 mt-1">{errors.date}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="quantity"
                    className="block text-sm font-semibold text-gray-700 mb-2"
                  >
                    Quantity <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    id="quantity"
                    name="quantity"
                    value={formData.quantity}
                    onChange={handleChange}
                    placeholder="Enter present quantity"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  />
                  {errors.quantity && (
                    <p className="text-sm text-red-500 mt-1">
                      {errors.quantity}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="price"
                    className="block text-sm font-semibold text-gray-700 mb-2"
                  >
                    Price (Per Unit) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    id="price"
                    name="price"
                    value={formData.price}
                    onChange={handleChange}
                    placeholder="Enter price"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  />
                  {errors.price && (
                    <p className="text-sm text-red-500 mt-1">{errors.price}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="gstPercent"
                    className="block text-sm font-semibold text-gray-700 mb-2"
                  >
                    GST (%) <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="gstPercent"
                    name="gstPercent"
                    value={formData.gstPercent}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition bg-white"
                  >
                    {GST_OPTIONS.map((option) => (
                      <option key={option} value={String(option)}>
                        {option}%
                      </option>
                    ))}
                  </select>
                  {errors.gstPercent && (
                    <p className="text-sm text-red-500 mt-1">
                      {errors.gstPercent}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    GST Amount
                  </label>
                  <div className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 font-semibold">
                    INR {gstAmount.toFixed(2)}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Total Amount
                  </label>
                  <div className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 font-semibold">
                    INR {totalAmount.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4 pt-6 border-t border-gray-200">
              <button
                type="submit"
                className="flex-1 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold py-3 rounded-lg transition duration-200 shadow-md hover:shadow-lg"
              >
                <span className="inline-flex items-center gap-2">
                  <Plus size={18} />
                  Add Drug
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
