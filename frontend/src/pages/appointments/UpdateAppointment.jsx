import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import DashboardLayout from "../../app/layout/DashboardLayout";
import LoadingOverlay from "@/components/ui/LoadingOverlay";
import ServiceItemInput from "@/components/ui/ServiceItemInput";
import {
  ArrowLeft,
  CalendarClock,
  Camera,
  Check,
  Edit,
  Eye,
  FileText,
  HeartPulse,
  History,
  Image as ImageIcon,
  LayoutTemplate,
  Mic,
  Pill,
  Plus,
  Printer,
  Save,
  Stethoscope,
  UserRound,
  X,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import Webcam from "react-webcam";
import {
  getAllAppointments,
  getAppointmentById,
  updateAppointment,
} from "@/services/appointment_service";
import {
  createDrugTemplate,
  deleteDrugTemplate,
  getDrugNameAndQuantity,
  getAllDrugTemplates,
  getDrugTemplateById,
} from "@/services/drug_service";
import {
  uploadImage,
  deleteImage,
  dataURLToBlob,
} from "@/services/firebase_storage";

const DURATION_UNITS = ["days", "weeks", "months", "year"];

function SectionHeading({ icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-4 pb-2 border-b-2 border-purple-200">
      <span className="text-purple-700">{icon}</span>
      <h2 className="text-xl font-bold text-gray-800 text-center">{title}</h2>
    </div>
  );
}

export default function UpdateAppointment() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const sourceTab = (location.state?.sourceTab || "").toLowerCase();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState(null);
  const [drugs, setDrugs] = useState([]);
  const [listeningField, setListeningField] = useState("");
  const [templates, setTemplates] = useState([]);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [capturingImage, setCapturingImage] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [completedAppointment, setCompletedAppointment] = useState(null);
  const [editingMedicineId, setEditingMedicineId] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [patientHistory, setPatientHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const webcamRef = useRef(null);

  const [formData, setFormData] = useState({
    customerId: "",
    customerName: "",
    phone: "",
    petName: "",
    petAge: "",
    petAgeYears: "",
    petAgeMonths: "",
    petType: "",
    petBreed: "",
    petSex: "",
    vaccinated: "",
    vaccinationStartDate: "",
    vaccinationEndDate: "",
    deworming: "",
    dewormingStartDate: "",
    dewormingEndDate: "",
    date: "",
    time: "",
    status: "active",
    chiefComplaint: "",
    historyExamination: "",
    tentativeDiagnosis: "",
    finalDiagnosis: "",
    advice: "",
    temperature: "",
    cmm: "",
    heartRate: "",
    breathingRate: "",
    pulseRate: "",
    weight: "",
    doctorFee: "",
    reviewDate: "",
    scannedImages: [],
    medicines: [],
  });

  const [treatmentDrugFields, setTreatmentDrugFields] = useState({
    drugName: "",
    unit: "mg",
    quantity: "",
    route: "I/V",
  });

  const [medicineForm, setMedicineForm] = useState({
    drugName: "",
    duration: "",
    unit: "days",
    timing: {
      M: "",
      A: "",
      E: "",
      N: "",
    },
    food: "",
    specialInstruction: "",
  });

  const isReadOnly = useMemo(
    () =>
      (formData.status || "").toLowerCase() === "cancelled" ||
      (sourceTab || "").toLowerCase() === "cancelled",
    [formData.status, sourceTab],
  );

  const isVaccinated = (formData.vaccinated || "").toLowerCase() === "yes";
  const isDewormed = (formData.deworming || "").toLowerCase() === "yes";
  const petAgeDisplay = useMemo(() => {
    const years = Number(formData.petAgeYears || 0);
    const months = Number(formData.petAgeMonths || 0);
    const hasYearsMonths =
      Number.isFinite(years) &&
      Number.isFinite(months) &&
      (formData.petAgeYears !== "" || formData.petAgeMonths !== "");

    if (hasYearsMonths) {
      return `${years} year${years === 1 ? "" : "s"} ${months} month${months === 1 ? "" : "s"}`;
    }

    if (formData.petAge === "" || formData.petAge === null) return "-";
    const legacyAge = Number(formData.petAge);
    if (!Number.isFinite(legacyAge)) return String(formData.petAge);
    const wholeYears = Math.floor(legacyAge);
    const remainingMonths = Math.round((legacyAge - wholeYears) * 12);
    return `${wholeYears} year${wholeYears === 1 ? "" : "s"} ${remainingMonths} month${remainingMonths === 1 ? "" : "s"}`;
  }, [formData.petAge, formData.petAgeMonths, formData.petAgeYears]);

  useEffect(() => {
    fetchDrugs();
    hydrateAppointment();
  }, [appointmentId]);

  const fetchDrugs = async () => {
    try {
      const response = await getDrugNameAndQuantity({ limit: 1000 });
      setDrugs(response.drugs || []);
    } catch (err) {
      console.error("Failed to load drugs:", err);
    }
  };

  const hydrateAppointment = async () => {
    try {
      setLoading(true);
      setError(null);

      const fromRow = location.state?.appointment;
      if (fromRow) {
        setFormData((prev) => ({
          ...prev,
          customerId: fromRow.customerId || "",
          customerName: fromRow.customerName || "",
          phone: fromRow.phone || "",
          petName: fromRow.petName || "",
          petAge: fromRow.petAge ?? "",
          petAgeYears: fromRow.petAgeYears ?? "",
          petAgeMonths: fromRow.petAgeMonths ?? "",
          petType: fromRow.petType || "",
          petBreed: fromRow.petBreed || "",
          petSex: fromRow.petSex || "",
          vaccinated: fromRow.vaccinated || "",
          vaccinationStartDate: fromRow.vaccinationStartDate || "",
          vaccinationEndDate: fromRow.vaccinationEndDate || "",
          deworming: fromRow.deworming || "",
          dewormingStartDate: fromRow.dewormingStartDate || "",
          dewormingEndDate: fromRow.dewormingEndDate || "",
          date: fromRow.date || "",
          time: fromRow.time || "",
          status: fromRow.status || "active",
          chiefComplaint: fromRow.chiefComplaint || "",
          historyExamination: fromRow.historyExamination || "",
          tentativeDiagnosis: fromRow.tentativeDiagnosis || "",
          finalDiagnosis: fromRow.finalDiagnosis || "",
          treatment: fromRow.treatment || "",
          advice: fromRow.advice || "",
          temperature: fromRow.temperature || "",
          cmm: fromRow.cmm || "",
          heartRate: fromRow.heartRate || "",
          breathingRate: fromRow.breathingRate || "",
          pulseRate: fromRow.pulseRate || "",
          weight: fromRow.weight || "",
          doctorFee: fromRow.doctorFee ?? "",
          reviewDate: fromRow.reviewDate || "",
          scannedImages: fromRow.scannedImages || [],
          medicines: fromRow.medicines || [],
        }));
      }

      const apiResponse = await getAppointmentById(appointmentId);
      const apiAppointment = apiResponse.appointment || {};
      setFormData((prev) => ({
        ...prev,
        customerId: apiAppointment.customerId || "",
        customerName: apiAppointment.customerName || "",
        phone: apiAppointment.phone || "",
        petName: apiAppointment.petName || "",
        petAge: apiAppointment.petAge ?? "",
        petAgeYears: apiAppointment.petAgeYears ?? "",
        petAgeMonths: apiAppointment.petAgeMonths ?? "",
        petType: apiAppointment.petType || "",
        petBreed: apiAppointment.petBreed || "",
        petSex: apiAppointment.petSex || "",
        vaccinated: apiAppointment.vaccinated || "",
        vaccinationStartDate: apiAppointment.vaccinationStartDate || "",
        vaccinationEndDate: apiAppointment.vaccinationEndDate || "",
        deworming: apiAppointment.deworming || "",
        dewormingStartDate: apiAppointment.dewormingStartDate || "",
        dewormingEndDate: apiAppointment.dewormingEndDate || "",
        date: apiAppointment.date || "",
        time: apiAppointment.time || "",
        status: apiAppointment.status || "active",
        chiefComplaint: apiAppointment.chiefComplaint || "",
        historyExamination: apiAppointment.historyExamination || "",
        tentativeDiagnosis: apiAppointment.tentativeDiagnosis || "",
        finalDiagnosis: apiAppointment.finalDiagnosis || "",
        treatment: apiAppointment.treatment || "",
        advice: apiAppointment.advice || "",
        temperature: apiAppointment.temperature || "",
        cmm: apiAppointment.cmm || "",
        heartRate: apiAppointment.heartRate || "",
        breathingRate: apiAppointment.breathingRate || "",
        pulseRate: apiAppointment.pulseRate || "",
        weight: apiAppointment.weight || "",
        doctorFee: apiAppointment.doctorFee ?? "",
        reviewDate: apiAppointment.reviewDate || "",
        scannedImages: apiAppointment.scannedImages || [],
        medicines: apiAppointment.medicines || [],
      }));
    } catch (err) {
      setError("Failed to load appointment details.");
    } finally {
      setLoading(false);
    }
  };

  const handleInvestigationChange = (event) => {
    if (isReadOnly) return;
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const startDictation = (fieldName) => {
    if (isReadOnly) return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setListeningField(fieldName);

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      setFormData((prev) => ({
        ...prev,
        [fieldName]: prev[fieldName]
          ? `${prev[fieldName]} ${transcript}`
          : transcript,
      }));
    };

    recognition.onerror = () => {
      setListeningField("");
      toast.error("Unable to capture voice input.");
    };

    recognition.onend = () => {
      setListeningField("");
    };

    recognition.start();
  };

  const startMedicineDictation = (fieldName) => {
    if (isReadOnly) return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setListeningField(`medicine_${fieldName}`);

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      setMedicineForm((prev) => ({
        ...prev,
        [fieldName]: prev[fieldName]
          ? `${prev[fieldName]} ${transcript}`
          : transcript,
      }));
    };

    recognition.onerror = () => {
      setListeningField("");
      toast.error("Unable to capture voice input.");
    };

    recognition.onend = () => {
      setListeningField("");
    };

    recognition.start();
  };

  const addMedicine = () => {
    if (isReadOnly) return;
    if (!medicineForm.drugName) {
      toast.error("Drug name is required.");
      return;
    }
    if (!medicineForm.duration || Number(medicineForm.duration) <= 0) {
      toast.error("Duration must be greater than 0.");
      return;
    }

    const timingValues = Object.values(medicineForm.timing).map((value) =>
      Number(value || 0),
    );
    if (timingValues.every((value) => value <= 0)) {
      toast.error("At least one value in M/A/E/N must be greater than 0.");
      return;
    }

    const selectedDrug = drugs.find(
      (drug) => drug.name === medicineForm.drugName,
    );

    const medicine = {
      id: `med_${Date.now()}`,
      drugName: medicineForm.drugName,
      availableQuantity: selectedDrug?.presentQuantity ?? 0,
      duration: Number(medicineForm.duration),
      unit: medicineForm.unit,
      timing: medicineForm.timing,
      food: medicineForm.food,
      specialInstruction: medicineForm.specialInstruction.trim(),
    };

    setFormData((prev) => ({
      ...prev,
      medicines: [...prev.medicines, medicine],
    }));

    setMedicineForm({
      drugName: "",
      duration: "",
      unit: "days",
      timing: { M: "", A: "", E: "", N: "" },
      food: "",
      specialInstruction: "",
    });
  };

  const editMedicine = (medicineId) => {
    if (isReadOnly) return;
    const medicine = formData.medicines.find((med) => med.id === medicineId);
    if (medicine) {
      setMedicineForm({
        drugName: medicine.drugName,
        duration: medicine.duration.toString(),
        unit: medicine.unit,
        timing: { ...medicine.timing },
        food: medicine.food || "",
        specialInstruction: medicine.specialInstruction || "",
      });
      setEditingMedicineId(medicineId);
    }
  };

  const updateMedicine = () => {
    if (isReadOnly) return;
    if (!medicineForm.drugName) {
      toast.error("Drug name is required.");
      return;
    }
    if (!medicineForm.duration || Number(medicineForm.duration) <= 0) {
      toast.error("Duration must be greater than 0.");
      return;
    }

    const timingValues = Object.values(medicineForm.timing).map((value) =>
      Number(value || 0),
    );
    if (timingValues.every((value) => value <= 0)) {
      toast.error("At least one value in M/A/E/N must be greater than 0.");
      return;
    }

    const selectedDrug = drugs.find(
      (drug) => drug.name === medicineForm.drugName,
    );

    const updatedMedicine = {
      id: editingMedicineId,
      drugName: medicineForm.drugName,
      availableQuantity: selectedDrug?.presentQuantity ?? 0,
      duration: Number(medicineForm.duration),
      unit: medicineForm.unit,
      timing: medicineForm.timing,
      food: medicineForm.food,
      specialInstruction: medicineForm.specialInstruction.trim(),
    };

    setFormData((prev) => ({
      ...prev,
      medicines: prev.medicines.map((med) =>
        med.id === editingMedicineId ? updatedMedicine : med,
      ),
    }));

    setMedicineForm({
      drugName: "",
      duration: "",
      unit: "days",
      timing: { M: "", A: "", E: "", N: "" },
      food: "",
      specialInstruction: "",
    });
    setEditingMedicineId(null);
    toast.success("Medicine updated successfully.");
  };

  const cancelEdit = () => {
    setMedicineForm({
      drugName: "",
      duration: "",
      unit: "days",
      timing: { M: "", A: "", E: "", N: "" },
      food: "",
      specialInstruction: "",
    });
    setEditingMedicineId(null);
  };

  const appendTreatmentDrug = () => {
    if (isReadOnly) return;
    const { drugName, unit, quantity, route } = treatmentDrugFields;

    if (!drugName.trim()) {
      toast.error("Please select Drug Name");
      return;
    }
    if (!quantity || Number(quantity) <= 0) {
      toast.error("Quantity must be a positive number");
      return;
    }

    const formattedLine = `${drugName}-${quantity}${unit} (${route})`;
    setFormData((prev) => ({
      ...prev,
      treatment: prev.treatment
        ? `${prev.treatment}\n${formattedLine}`
        : formattedLine,
    }));

    setTreatmentDrugFields({
      drugName: "",
      quantity: "",
      unit: "mg",
      route: "I/V",
    });

    // Keep entered fields for repeat clicks but allow user to clear manually
    // (or we can choose to clear automatically): here we keep as-is.
    toast.success("Treatment row appended");
  };

  const openHistoryModal = async () => {
    if (!formData.customerId) {
      toast.error("Customer ID not available");
      return;
    }

    try {
      setHistoryLoading(true);
      setShowHistoryModal(true);

      // Fetch patient history - you'll need to implement this API endpoint
      // For now, I'll create a placeholder that fetches appointments for this customer
      const response = await getAllAppointments({
        customer_id: formData.customerId,
        minimal: false,
      });

      // Filter out the current appointment and sort by date (newest first)
      const historyAppointments = (response.appointments || [])
        .filter((appointment) => appointment.id !== appointmentId)
        .sort(
          (a, b) =>
            new Date(b.date || b.created_at) - new Date(a.date || a.created_at),
        );

      setPatientHistory(historyAppointments);
    } catch (error) {
      console.error("Error fetching patient history:", error);
      toast.error("Failed to load patient history");
      setShowHistoryModal(false);
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeHistoryModal = () => {
    setShowHistoryModal(false);
    setPatientHistory([]);
  };

  const toggleFoodChoice = (choice) => {
    if (isReadOnly) return;
    setMedicineForm((prev) => ({
      ...prev,
      food: prev.food === choice ? "" : choice,
    }));
  };

  const loadTemplates = async () => {
    try {
      setTemplatesLoading(true);
      const response = await getAllDrugTemplates();
      setTemplates(response.templates || []);
    } catch (err) {
      toast.error("Failed to load templates.");
    } finally {
      setTemplatesLoading(false);
    }
  };

  const openTemplatesModal = async () => {
    setShowTemplatesModal(true);
    setSelectedTemplate(null);
    await loadTemplates();
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast.error("Template name is required.");
      return;
    }
    if (!formData.medicines.length) {
      toast.error("Add at least one medicine to save template.");
      return;
    }

    try {
      setTemplateSaving(true);
      await createDrugTemplate({
        templateName: templateName.trim(),
        medicines: formData.medicines,
      });
      toast.success("Template saved successfully.");
      setTemplateName("");
      setShowSaveTemplateModal(false);
      await loadTemplates();
    } catch (err) {
      toast.error("Failed to save template.");
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleApplyTemplate = (template) => {
    if (isReadOnly) return;
    const medicines = (template?.medicines || []).map((medicine, index) => ({
      ...medicine,
      id: medicine.id || `med_tpl_${Date.now()}_${index}`,
    }));
    setFormData((prev) => ({ ...prev, medicines }));
    toast.success("Template applied.");
    setShowTemplatesModal(false);
  };

  const handleDeleteTemplate = async (templateId) => {
    try {
      await deleteDrugTemplate(templateId);
      toast.success("Template deleted.");
      if (selectedTemplate?.id === templateId) {
        setSelectedTemplate(null);
      }
      await loadTemplates();
    } catch (err) {
      toast.error("Failed to delete template.");
    }
  };

  const handleViewTemplate = async (templateId) => {
    try {
      const response = await getDrugTemplateById(templateId);
      setSelectedTemplate(response.template || null);
    } catch (err) {
      toast.error("Failed to fetch template details.");
    }
  };

  const removeMedicine = (medicineId) => {
    if (isReadOnly) return;
    setFormData((prev) => ({
      ...prev,
      medicines: prev.medicines.filter(
        (medicine) => medicine.id !== medicineId,
      ),
    }));
  };

  const handleImagesSelected = async (event) => {
    if (isReadOnly) return;
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setImageUploading(true);
    try {
      const uploadPromises = files.map(async (file) => {
        const fileName = `appointment_${appointmentId || "temp"}_${Date.now()}_${file.name}`;
        return await uploadImage(file, "appointments", fileName);
      });

      const uploadedUrls = await Promise.all(uploadPromises);

      setFormData((prev) => ({
        ...prev,
        scannedImages: [...(prev.scannedImages || []), ...uploadedUrls].filter(
          Boolean,
        ),
      }));

      toast.success(`${files.length} image(s) uploaded successfully!`);
      event.target.value = "";
    } catch (err) {
      console.error("Error uploading images:", err);
      toast.error("Failed to upload selected images. Please try again.");
    } finally {
      setImageUploading(false);
    }
  };

  const stopLiveScanCamera = () => {
    setCameraActive(false);
  };

  const startLiveScanCamera = async () => {
    if (isReadOnly) return;
    try {
      setCameraError("");
      console.log("Starting camera...");
      setCameraActive(true);
    } catch (err) {
      console.error("Camera error:", err);
      setCameraError("Unable to open camera. Please allow camera permission.");
      setCameraActive(false);
    }
  };

  const captureLiveScanImage = async () => {
    if (isReadOnly || capturingImage) return;

    const webcam = webcamRef.current;
    if (!webcam) {
      toast.error("Camera is not ready yet.");
      return;
    }

    setCapturingImage(true);

    try {
      console.log("Capturing image from camera...");
      const imageSrc = webcam.getScreenshot();
      if (!imageSrc) {
        toast.error("Failed to capture image.");
        return;
      }

      console.log("Image captured as data URL");

      // Convert data URL to blob for Firebase upload
      const imageBlob = dataURLToBlob(imageSrc);
      console.log("Converted to blob:", imageBlob);

      // Upload to Firebase Storage
      const fileName = `appointment_${appointmentId || "temp"}_${Date.now()}.jpg`;
      console.log("Uploading with filename:", fileName);
      const downloadURL = await uploadImage(
        imageBlob,
        "appointments",
        fileName,
      );
      console.log("Upload successful, URL:", downloadURL);

      // Add the Firebase Storage URL to the form data
      setFormData((prev) => ({
        ...prev,
        scannedImages: [...(prev.scannedImages || []), downloadURL].filter(
          Boolean,
        ),
      }));

      toast.success("Image captured and uploaded successfully!");
    } catch (error) {
      console.error("Error capturing/uploading image:", error);
      toast.error("Failed to capture and upload image. Please try again.");
    } finally {
      setCapturingImage(false);
    }
  };

  const removeScannedImage = async (indexToRemove) => {
    if (isReadOnly) return;

    const imageToRemove = (formData.scannedImages || [])[indexToRemove];

    // If it's a Firebase Storage URL, delete from storage
    if (imageToRemove && imageToRemove.includes("firebasestorage.app")) {
      try {
        await deleteImage(imageToRemove);
      } catch (error) {
        console.error("Error deleting image from storage:", error);
        // Continue with removing from form data even if storage deletion fails
      }
    }

    setFormData((prev) => ({
      ...prev,
      scannedImages: (prev.scannedImages || []).filter(
        (_, index) => index !== indexToRemove,
      ),
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isReadOnly) return;

    try {
      setSaving(true);
      const payload = {
        customerId: formData.customerId,
        customerName: formData.customerName,
        phone: formData.phone,
        petName: formData.petName,
        petAgeYears: formData.petAgeYears,
        petAgeMonths: formData.petAgeMonths,
        petType: formData.petType,
        petBreed: formData.petBreed,
        petSex: formData.petSex,
        vaccinated: formData.vaccinated,
        vaccinationStartDate: formData.vaccinationStartDate,
        vaccinationEndDate: formData.vaccinationEndDate,
        deworming: formData.deworming,
        dewormingStartDate: formData.dewormingStartDate,
        dewormingEndDate: formData.dewormingEndDate,
        date: formData.date,
        time: formData.time,
        status: "completed",
        chiefComplaint: formData.chiefComplaint,
        historyExamination: formData.historyExamination,
        tentativeDiagnosis: formData.tentativeDiagnosis,
        finalDiagnosis: formData.finalDiagnosis,
        treatment: formData.treatment,
        advice: formData.advice,
        temperature: formData.temperature,
        cmm: formData.cmm,
        heartRate: formData.heartRate,
        breathingRate: formData.breathingRate,
        pulseRate: formData.pulseRate,
        weight: formData.weight,
        doctorFee: Number(formData.doctorFee || 0),
        reviewDate: formData.reviewDate || null,
        scannedImages: formData.scannedImages || [],
        medicines: formData.medicines,
      };

      await updateAppointment(appointmentId, payload);
      toast.success("Appointment completed successfully.");

      // Store completed appointment and show prescription modal
      setCompletedAppointment({
        id: appointmentId,
        ...payload,
      });
      setShowPrescriptionModal(true);
      setSaving(false);
    } catch (err) {
      toast.error("Failed to close appointment.");
      setSaving(false);
    }
  };

  const handleCancelAppointment = async () => {
    if (isReadOnly) return;
    try {
      setCanceling(true);
      await updateAppointment(appointmentId, {
        status: "cancelled",
        scannedImages: formData.scannedImages || [],
      });
      toast.success("Appointment cancelled successfully.");
      navigate("/appointments");
    } catch (err) {
      toast.error("Failed to cancel appointment.");
      setCanceling(false);
    }
  };

  const closePrescriptionModal = () => {
    setShowPrescriptionModal(false);
    setCompletedAppointment(null);
    navigate("/appointments");
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="w-full">
        <div className="bg-white rounded-2xl shadow-lg p-8 relative">
          <LoadingOverlay
            show={
              saving ||
              loading ||
              canceling ||
              templatesLoading ||
              historyLoading ||
              imageUploading ||
              templateSaving
            }
            message="Saving appointment data..."
          />
          {error && (
            <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <h1 className="text-3xl font-bold text-gray-800">
                Close Appointment
              </h1>
              <button
                type="button"
                onClick={() => navigate("/appointments")}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-200 shadow-md hover:shadow-lg"
              >
                <ArrowLeft size={16} />
                Back
              </button>
            </div>

            <div>
              <SectionHeading
                icon={<UserRound size={20} />}
                title="Patient Detail"
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Owner Name
                  </label>
                  <input
                    type="text"
                    value={formData.customerName}
                    disabled
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Number
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    disabled
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Pet Name
                  </label>
                  <input
                    type="text"
                    value={formData.petName}
                    disabled
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Pet Age
                  </label>
                  <input
                    type="text"
                    value={petAgeDisplay}
                    disabled
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Breed
                  </label>
                  <input
                    type="text"
                    value={formData.petBreed || "-"}
                    disabled
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Species
                  </label>
                  <input
                    type="text"
                    value={formData.petType}
                    disabled
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Sex
                  </label>
                  <input
                    type="text"
                    value={formData.petSex}
                    disabled
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Vaccination Status
                  </label>
                  <input
                    type="text"
                    value={formData.vaccinated}
                    disabled
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Deworming Status
                  </label>
                  <input
                    type="text"
                    value={formData.deworming || "-"}
                    disabled
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-700"
                  />
                </div>
                {/* <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Deworming Start Date
                  </label>
                  <input
                    type="date"
                    name="dewormingStartDate"
                    value={formData.dewormingStartDate}
                    onChange={handleInvestigationChange}
                    disabled
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition disabled:bg-gray-100 disabled:text-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Deworming End Date
                  </label>
                  <input
                    type="date"
                    name="dewormingEndDate"
                    value={formData.dewormingEndDate}
                    onChange={handleInvestigationChange}
                    disabled
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition disabled:bg-gray-100 disabled:text-gray-700"
                  />
                </div> */}
                {isDewormed ? (
                  <>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Deworming Date
                      </label>
                      <input
                        type="text"
                        value={formData.dewormingStartDate || "-"}
                        disabled
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-700"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Deworming Next Due Date
                      </label>
                      <input
                        type="text"
                        value={formData.dewormingEndDate || "-"}
                        disabled
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-700"
                      />
                    </div>
                  </>
                ) : null}
                {isVaccinated ? (
                  <>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Vaccination Date
                      </label>
                      <input
                        type="text"
                        value={formData.vaccinationStartDate || "-"}
                        disabled
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-700"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Vaccination Next Due Date
                      </label>
                      <input
                        type="text"
                        value={formData.vaccinationEndDate || "-"}
                        disabled
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-700"
                      />
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <div>
              <SectionHeading
                icon={<CalendarClock size={20} />}
                title="Appointment Details"
              />
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                        Appointment Date
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                        Appointment Time
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-gray-100">
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {formData.date || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {formData.time || "-"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <SectionHeading icon={<HeartPulse size={20} />} title="Vitals" />
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Temperature (°F)
                  </label>
                  <input
                    type="text"
                    name="temperature"
                    value={formData.temperature}
                    onChange={handleInvestigationChange}
                    disabled={isReadOnly}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition disabled:bg-gray-100 disabled:text-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    CMM
                  </label>
                  <input
                    type="text"
                    name="cmm"
                    value={formData.cmm}
                    onChange={handleInvestigationChange}
                    disabled={isReadOnly}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition disabled:bg-gray-100 disabled:text-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Heart Rate (BPM)
                  </label>
                  <input
                    type="text"
                    name="heartRate"
                    value={formData.heartRate}
                    onChange={handleInvestigationChange}
                    disabled={isReadOnly}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition disabled:bg-gray-100 disabled:text-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Breathing Rate (BPM)
                  </label>
                  <input
                    type="text"
                    name="breathingRate"
                    value={formData.breathingRate}
                    onChange={handleInvestigationChange}
                    disabled={isReadOnly}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition disabled:bg-gray-100 disabled:text-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Pulse Rate (BPM)
                  </label>
                  <input
                    type="text"
                    name="pulseRate"
                    value={formData.pulseRate}
                    onChange={handleInvestigationChange}
                    disabled={isReadOnly}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition disabled:bg-gray-100 disabled:text-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Weight (Kg)
                  </label>
                  <input
                    type="text"
                    name="weight"
                    value={formData.weight}
                    onChange={handleInvestigationChange}
                    disabled={isReadOnly}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition disabled:bg-gray-100 disabled:text-gray-700"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-center mt-2">
              <button
                type="button"
                onClick={() => openHistoryModal()}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-6 rounded-lg transition duration-200 shadow-md hover:shadow-lg"
              >
                <History size={18} />
                Appointments History
              </button>
            </div>

            <div>
              <SectionHeading
                icon={<Stethoscope size={20} />}
                title="Investigation"
              />
              <div className="grid grid-cols-1 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Chief Complaint
                  </label>
                  <div className="flex gap-2">
                    <textarea
                      name="chiefComplaint"
                      rows="3"
                      value={formData.chiefComplaint}
                      onChange={handleInvestigationChange}
                      disabled={isReadOnly}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition resize-none disabled:bg-gray-100 disabled:text-gray-700"
                    />
                    <button
                      type="button"
                      onClick={() => startDictation("chiefComplaint")}
                      disabled={isReadOnly}
                      className="h-12 w-12 inline-flex items-center justify-center rounded-lg bg-purple-100 text-purple-600 hover:bg-purple-200 disabled:opacity-50"
                      title="Voice Input"
                    >
                      <Mic size={18} />
                    </button>
                  </div>
                  {listeningField === "chiefComplaint" && (
                    <p className="text-xs text-purple-700 mt-1">Listening...</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    History and Examination
                  </label>
                  <div className="flex gap-2">
                    <textarea
                      name="historyExamination"
                      rows="3"
                      value={formData.historyExamination}
                      onChange={handleInvestigationChange}
                      disabled={isReadOnly}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition resize-none disabled:bg-gray-100 disabled:text-gray-700"
                    />
                    <button
                      type="button"
                      onClick={() => startDictation("historyExamination")}
                      disabled={isReadOnly}
                      className="h-12 w-12 inline-flex items-center justify-center rounded-lg bg-purple-100 text-purple-600 hover:bg-purple-200 disabled:opacity-50"
                      title="Voice Input"
                    >
                      <Mic size={18} />
                    </button>
                  </div>
                  {listeningField === "historyExamination" && (
                    <p className="text-xs text-purple-700 mt-1">Listening...</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Tentative Diagnosis
                  </label>
                  <div className="flex gap-2">
                    <textarea
                      name="tentativeDiagnosis"
                      rows="3"
                      value={formData.tentativeDiagnosis}
                      onChange={handleInvestigationChange}
                      disabled={isReadOnly}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition resize-none disabled:bg-gray-100 disabled:text-gray-700"
                    />
                    <button
                      type="button"
                      onClick={() => startDictation("tentativeDiagnosis")}
                      disabled={isReadOnly}
                      className="h-12 w-12 inline-flex items-center justify-center rounded-lg bg-purple-100 text-purple-600 hover:bg-purple-200 disabled:opacity-50"
                      title="Voice Input"
                    >
                      <Mic size={18} />
                    </button>
                  </div>
                  {listeningField === "tentativeDiagnosis" && (
                    <p className="text-xs text-purple-700 mt-1">Listening...</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Final Diagnosis
                  </label>
                  <div className="flex gap-2">
                    <textarea
                      name="finalDiagnosis"
                      rows="3"
                      value={formData.finalDiagnosis}
                      onChange={handleInvestigationChange}
                      disabled={isReadOnly}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition resize-none disabled:bg-gray-100 disabled:text-gray-700"
                    />
                    <button
                      type="button"
                      onClick={() => startDictation("finalDiagnosis")}
                      disabled={isReadOnly}
                      className="h-12 w-12 inline-flex items-center justify-center rounded-lg bg-purple-100 text-purple-600 hover:bg-purple-200 disabled:opacity-50"
                      title="Voice Input"
                    >
                      <Mic size={18} />
                    </button>
                  </div>
                  {listeningField === "finalDiagnosis" && (
                    <p className="text-xs text-purple-700 mt-1">Listening...</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Treatment
                  </label>
                  <div className="flex gap-2">
                    <textarea
                      name="treatment"
                      rows="3"
                      value={formData.treatment}
                      onChange={handleInvestigationChange}
                      disabled={isReadOnly}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition resize-none disabled:bg-gray-100 disabled:text-gray-700"
                    />
                    <button
                      type="button"
                      onClick={() => startDictation("treatment")}
                      disabled={isReadOnly}
                      className="h-12 w-12 inline-flex items-center justify-center rounded-lg bg-purple-100 text-purple-600 hover:bg-purple-200 disabled:opacity-50"
                      title="Voice Input"
                    >
                      <Mic size={18} />
                    </button>
                  </div>
                  {listeningField === "treatment" && (
                    <p className="text-xs text-purple-700 mt-1">Listening...</p>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-3 items-end">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Drug Name
                      </label>
                      <ServiceItemInput
                        value={treatmentDrugFields.drugName}
                        onChange={(value) =>
                          setTreatmentDrugFields((prev) => ({
                            ...prev,
                            drugName: value,
                          }))
                        }
                        drugs={drugs}
                        placeholder="Select drug"
                        disabled={isReadOnly}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Quantity
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={treatmentDrugFields.quantity}
                        onChange={(e) =>
                          setTreatmentDrugFields((prev) => ({
                            ...prev,
                            quantity: e.target.value,
                          }))
                        }
                        disabled={isReadOnly}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition disabled:bg-gray-100 disabled:text-gray-700"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Unit
                      </label>
                      <select
                        value={treatmentDrugFields.unit}
                        onChange={(e) =>
                          setTreatmentDrugFields((prev) => ({
                            ...prev,
                            unit: e.target.value,
                          }))
                        }
                        disabled={isReadOnly}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition bg-white disabled:bg-gray-100 disabled:text-gray-700"
                      >
                        {["mg", "ml", "IU"].map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Route
                      </label>
                      <select
                        value={treatmentDrugFields.route}
                        onChange={(e) =>
                          setTreatmentDrugFields((prev) => ({
                            ...prev,
                            route: e.target.value,
                          }))
                        }
                        disabled={isReadOnly}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition bg-white disabled:bg-gray-100 disabled:text-gray-700"
                      >
                        {["I/V", "I/M", "S/C", "P/O"].map((route) => (
                          <option key={route} value={route}>
                            {route}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={appendTreatmentDrug}
                        disabled={isReadOnly}
                        className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 px-4 rounded-lg transition duration-200 shadow-md hover:shadow-lg disabled:opacity-50"
                        title="Append to treatment"
                      >
                        <Check size={18} />
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Advice
                  </label>
                  <div className="flex gap-2">
                    <textarea
                      name="advice"
                      rows="3"
                      value={formData.advice}
                      onChange={handleInvestigationChange}
                      disabled={isReadOnly}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition resize-none disabled:bg-gray-100 disabled:text-gray-700"
                    />
                    <button
                      type="button"
                      onClick={() => startDictation("advice")}
                      disabled={isReadOnly}
                      className="h-12 w-12 inline-flex items-center justify-center rounded-lg bg-purple-100 text-purple-600 hover:bg-purple-200 disabled:opacity-50"
                      title="Voice Input"
                    >
                      <Mic size={18} />
                    </button>
                  </div>
                  {listeningField === "advice" && (
                    <p className="text-xs text-purple-700 mt-1">Listening...</p>
                  )}
                </div>
              </div>
            </div>

            <div>
              <SectionHeading
                icon={<Pill size={20} />}
                title={editingMedicineId ? "Edit Prescription" : "Prescription"}
              />

              <div className="grid grid-cols-1 md:grid-cols-10 gap-4 mb-3">
                <div className="md:col-span-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Drug Name
                  </label>
                  <ServiceItemInput
                    value={medicineForm.drugName}
                    onChange={(value) =>
                      setMedicineForm((prev) => ({
                        ...prev,
                        drugName: value,
                      }))
                    }
                    drugs={drugs}
                    placeholder="Select drug"
                    disabled={isReadOnly}
                  />
                </div>

                <div className="md:col-span-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Duration
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={medicineForm.duration}
                    onChange={(e) =>
                      setMedicineForm((prev) => ({
                        ...prev,
                        duration: e.target.value,
                      }))
                    }
                    disabled={isReadOnly}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition disabled:bg-gray-100 disabled:text-gray-700"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Unit
                  </label>
                  <select
                    value={medicineForm.unit}
                    onChange={(e) =>
                      setMedicineForm((prev) => ({
                        ...prev,
                        unit: e.target.value,
                      }))
                    }
                    disabled={isReadOnly}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition bg-white disabled:bg-gray-100 disabled:text-gray-700"
                  >
                    {DURATION_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    M - A - E - N
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {["M", "A", "E", "N"].map((slot) => (
                      <input
                        key={slot}
                        type="text"
                        placeholder={slot}
                        value={medicineForm.timing[slot]}
                        onChange={(e) =>
                          setMedicineForm((prev) => ({
                            ...prev,
                            timing: {
                              ...prev.timing,
                              [slot]: e.target.value,
                            },
                          }))
                        }
                        disabled={isReadOnly}
                        className="w-full px-2 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition disabled:bg-gray-100 disabled:text-gray-700"
                      />
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Timing
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => toggleFoodChoice("before")}
                      disabled={isReadOnly || medicineForm.food === "after"}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold border transition ${
                        medicineForm.food === "before"
                          ? "bg-purple-600 text-white border-purple-600"
                          : "border-gray-300 text-gray-700 hover:bg-gray-50"
                      } disabled:opacity-50`}
                    >
                      B/F
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFoodChoice("after")}
                      disabled={isReadOnly || medicineForm.food === "before"}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold border transition ${
                        medicineForm.food === "after"
                          ? "bg-purple-600 text-white border-purple-600"
                          : "border-gray-300 text-gray-700 hover:bg-gray-50"
                      } disabled:opacity-50`}
                    >
                      A/F
                    </button>
                  </div>
                </div>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Special Instruction
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={medicineForm.specialInstruction}
                      onChange={(e) =>
                        setMedicineForm((prev) => ({
                          ...prev,
                          specialInstruction: e.target.value,
                        }))
                      }
                      disabled={isReadOnly}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition disabled:bg-gray-100 disabled:text-gray-700"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        startMedicineDictation("specialInstruction")
                      }
                      disabled={isReadOnly}
                      className="h-12 w-12 inline-flex items-center justify-center rounded-lg bg-purple-100 text-purple-600 hover:bg-purple-200 disabled:opacity-50"
                      title="Voice Input"
                    >
                      <Mic size={18} />
                    </button>
                  </div>
                  {listeningField === "medicine_specialInstruction" ? (
                    <p className="text-xs text-purple-700 mt-1">Listening...</p>
                  ) : null}
                </div>
              </div>

              <div className="flex justify-center gap-4">
                {editingMedicineId ? (
                  <>
                    <button
                      type="button"
                      onClick={updateMedicine}
                      disabled={isReadOnly}
                      className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-5 rounded-lg transition duration-200 shadow-md hover:shadow-lg disabled:opacity-50"
                    >
                      <Save size={16} />
                      Update Medicine
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={isReadOnly}
                      className="inline-flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2.5 px-5 rounded-lg transition duration-200 shadow-md hover:shadow-lg disabled:opacity-50"
                    >
                      <X size={16} />
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={addMedicine}
                    disabled={isReadOnly}
                    className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 px-5 rounded-lg transition duration-200 shadow-md hover:shadow-lg disabled:opacity-50"
                  >
                    <Plus size={16} />
                    Add Medicine
                  </button>
                )}
              </div>

              <div className="mb-4 flex items-center justify-between">
                <div className="flex-1">
                  <SectionHeading
                    icon={<Pill size={20} />}
                    title="Prescription Table"
                  />
                </div>
                <button
                  type="button"
                  onClick={openTemplatesModal}
                  className="ml-4 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
                >
                  <LayoutTemplate size={16} />
                  Template
                </button>
              </div>
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                        Drug
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                        Duration
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                        M
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                        A
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                        E
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                        N
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                        Timing
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                        Instruction
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.medicines.length ? (
                      formData.medicines.map((medicine) => (
                        <tr
                          key={medicine.id}
                          className="border-t border-gray-100"
                        >
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {medicine.drugName}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {medicine.duration} {medicine.unit}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {medicine.timing?.M || 0}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {medicine.timing?.A || 0}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {medicine.timing?.E || 0}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {medicine.timing?.N || 0}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {medicine.food === "before"
                              ? "Before Food"
                              : medicine.food === "after"
                                ? "After Food"
                                : "-"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {medicine.specialInstruction || "-"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => editMedicine(medicine.id)}
                                disabled={
                                  isReadOnly ||
                                  editingMedicineId === medicine.id
                                }
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 disabled:opacity-50"
                                title="Edit Medicine"
                              >
                                <Edit size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeMedicine(medicine.id)}
                                disabled={isReadOnly}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-50"
                                title="Delete Medicine"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          className="px-4 py-4 text-sm text-gray-500"
                          colSpan={9}
                        >
                          No medicines added yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => setShowSaveTemplateModal(true)}
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg transition"
                >
                  <Save size={16} />
                  Save
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Doctor Fee
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    name="doctorFee"
                    value={formData.doctorFee}
                    onChange={handleInvestigationChange}
                    disabled={isReadOnly}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition disabled:bg-gray-100 disabled:text-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Review Date
                  </label>
                  <input
                    type="date"
                    name="reviewDate"
                    value={formData.reviewDate}
                    onChange={handleInvestigationChange}
                    disabled={isReadOnly}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition disabled:bg-gray-100 disabled:text-gray-700"
                  />
                </div>
              </div>

              <div className="mt-6">
                <SectionHeading
                  icon={<Camera size={20} />}
                  title="Scanned Images"
                />
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Upload Images
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      onChange={handleImagesSelected}
                      disabled={isReadOnly || imageUploading}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white file:mr-4 file:rounded-md file:border-0 file:bg-purple-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-purple-700 disabled:bg-gray-100 disabled:text-gray-700"
                    />
                    {imageUploading ? (
                      <div className="mt-2 inline-flex items-center gap-2 text-sm text-purple-700">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600" />
                        Uploading images ...
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Live Image Scan
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={startLiveScanCamera}
                        disabled={isReadOnly || cameraActive}
                        className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg transition"
                      >
                        <Camera size={16} />
                        Start Camera
                      </button>
                      <button
                        type="button"
                        onClick={captureLiveScanImage}
                        disabled={isReadOnly || !cameraActive || capturingImage}
                        className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg transition"
                      >
                        {capturingImage ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Check size={16} />
                            Capture
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={stopLiveScanCamera}
                        disabled={isReadOnly || !cameraActive}
                        className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg transition"
                      >
                        <X size={16} />
                        Stop
                      </button>
                    </div>
                    {cameraError ? (
                      <p className="text-xs text-red-600 mt-2">{cameraError}</p>
                    ) : null}
                    {cameraActive ? (
                      <div className="mt-3 rounded-xl border border-gray-200 overflow-hidden bg-black">
                        <Webcam
                          ref={webcamRef}
                          audio={false}
                          screenshotFormat="image/jpeg"
                          screenshotQuality={0.9}
                          videoConstraints={{
                            facingMode: { ideal: "environment" },
                          }}
                          className="w-full max-h-80 object-contain"
                          onUserMediaError={(error) => {
                            console.error("Webcam error:", error);
                            setCameraError(
                              "Unable to access camera. Please check permissions.",
                            );
                            setCameraActive(false);
                          }}
                          onUserMedia={() => {
                            console.log("Camera ready");
                          }}
                        />
                      </div>
                    ) : null}
                  </div>

                  {(formData.scannedImages || []).length ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {(formData.scannedImages || []).map((image, index) => (
                        <div
                          key={`scanned_${index}`}
                          className="relative rounded-lg border border-gray-200 overflow-hidden bg-white"
                        >
                          <img
                            src={image}
                            alt={`Scanned ${index + 1}`}
                            className="w-full h-36 object-cover"
                          />
                          {!isReadOnly ? (
                            <button
                              type="button"
                              onClick={() => removeScannedImage(index)}
                              className="absolute top-2 right-2 h-8 w-8 inline-flex items-center justify-center rounded-md bg-red-600 text-white hover:bg-red-700"
                              title="Remove Image"
                            >
                              <X size={14} />
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">
                      No images added yet.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {!isReadOnly ? (
              <div className="flex gap-4 mt-8 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleCancelAppointment}
                  disabled={saving || canceling}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg transition duration-200 shadow-md hover:shadow-lg"
                >
                  <X size={18} />
                  {canceling ? "Cancelling..." : "Cancel Appointment"}
                </button>
                <button
                  type="submit"
                  disabled={saving || canceling}
                  className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg transition duration-200 shadow-md hover:shadow-lg"
                >
                  <Save size={20} />
                  {saving ? "Closing..." : "Close Appointment"}
                </button>
              </div>
            ) : null}
          </form>
        </div>
      </div>

      {showSaveTemplateModal ? (
        <div className="fixed inset-0 z-50 bg-gray-100/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-800">
                Save Prescription Template
              </h3>
              <button
                type="button"
                onClick={() => setShowSaveTemplateModal(false)}
                className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Template Name
              </label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      Drug
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      Duration
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      M
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      A
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      E
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      N
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      Timing
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      Instruction
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {formData.medicines.length ? (
                    formData.medicines.map((medicine) => (
                      <tr
                        key={medicine.id}
                        className="border-t border-gray-100"
                      >
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {medicine.drugName}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {medicine.duration} {medicine.unit}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {medicine.timing?.M || 0}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {medicine.timing?.A || 0}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {medicine.timing?.E || 0}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {medicine.timing?.N || 0}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {medicine.food === "before"
                            ? "Before Food"
                            : medicine.food === "after"
                              ? "After Food"
                              : "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {medicine.specialInstruction || "-"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        className="px-4 py-4 text-sm text-gray-500"
                        colSpan={8}
                      >
                        No medicines added yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={templateSaving}
                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg disabled:opacity-50"
              >
                <Save size={16} />
                {templateSaving ? "Saving..." : "Save Template"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showTemplatesModal ? (
        <div className="fixed inset-0 z-50 bg-gray-100/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-800">
                Prescription Templates
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowTemplatesModal(false);
                  setSelectedTemplate(null);
                }}
                className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      Template Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {templatesLoading ? (
                    <tr>
                      <td
                        className="px-4 py-4 text-sm text-gray-500"
                        colSpan={2}
                      >
                        Loading templates...
                      </td>
                    </tr>
                  ) : templates.length ? (
                    templates.map((template) => (
                      <tr
                        key={template.id}
                        className="border-t border-gray-100"
                      >
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {template.templateName}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleApplyTemplate(template)}
                              disabled={isReadOnly}
                              className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-green-100 text-green-600 hover:bg-green-200 disabled:opacity-50"
                              title="Apply"
                            >
                              <Check size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTemplate(template.id)}
                              className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-red-100 text-red-600 hover:bg-red-200"
                              title="Delete"
                            >
                              <Trash2 size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleViewTemplate(template.id)}
                              className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200"
                              title="View"
                            >
                              <Eye size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        className="px-4 py-4 text-sm text-gray-500"
                        colSpan={2}
                      >
                        No templates found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {selectedTemplate ? (
              <div className="mt-5">
                <h4 className="text-lg font-semibold text-gray-800 mb-3">
                  Template Details: {selectedTemplate.templateName}
                </h4>
                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          Drug
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          Duration
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          M
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          A
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          E
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          N
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          Timing
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          Instruction
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedTemplate.medicines || []).length ? (
                        selectedTemplate.medicines.map((medicine, index) => (
                          <tr
                            key={`${selectedTemplate.id}_${index}`}
                            className="border-t border-gray-100"
                          >
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {medicine.drugName}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {medicine.duration} {medicine.unit}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {medicine.timing?.M || 0}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {medicine.timing?.A || 0}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {medicine.timing?.E || 0}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {medicine.timing?.N || 0}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {medicine.food === "before"
                                ? "Before Food"
                                : medicine.food === "after"
                                  ? "After Food"
                                  : "-"}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {medicine.specialInstruction || "-"}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            className="px-4 py-4 text-sm text-gray-500"
                            colSpan={8}
                          >
                            No medicines in this template.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Prescription Modal */}
      {showPrescriptionModal && completedAppointment && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">
                Appointment Prescription
              </h2>
              <button
                onClick={closePrescriptionModal}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X size={24} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              <iframe
                src={`/peepalvets.html?appointment_id=${
                  completedAppointment.id
                }&api_base=/api/v1`}
                title="Prescription Preview"
                className="w-full h-[75vh] border rounded-lg bg-white"
              />
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => {
                  const url = `/peepalvets.html?appointment_id=${completedAppointment.id}&print=1&api_base=/api/v1`;
                  window.open(url, "_blank", "noopener");
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition"
              >
                <Printer size={18} />
                Print
              </button>
              <button
                onClick={closePrescriptionModal}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition"
              >
                Back to Appointments
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-800">
                Appointment History - {formData.customerName}
              </h2>
              <button
                onClick={closeHistoryModal}
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
              ) : patientHistory.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500 text-lg">No appointments found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {patientHistory.map((appointment, index) => (
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
                          onClick={() => {
                            if (
                              appointment.scannedImages &&
                              appointment.scannedImages.length > 0
                            ) {
                              // Open image modal - you might need to implement this
                              window.open(
                                appointment.scannedImages[0],
                                "_blank",
                              );
                            }
                          }}
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
                          onClick={() => {
                            // Open prescription in new tab
                            const url = `/peepalvets.html?appointment_id=${appointment.id}&api_base=/api/v1`;
                            window.open(url, "_blank", "noopener");
                          }}
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
    </DashboardLayout>
  );
}
