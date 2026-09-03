import { useState, useEffect } from "react";
import Modal from "../common/Modal";
import { formatCurrency } from "../../utils/currency";
import { getServices } from "../../services/serviceCatalogService";
import { getMedications } from "../../services/pharmacyService";
import serviceOrderService from "../../services/serviceOrderService";

const CATEGORIES = [
  { id: "ALL", label: "All Services" },
  { id: "CONSULTATION", label: "Consultation" },
  { id: "LABORATORY", label: "Laboratory" },
  { id: "RADIOLOGY", label: "Radiology (X-Ray / US)" },
  { id: "CARDIOLOGY", label: "Cardiology / ECG" },
  { id: "PROCEDURE", label: "Procedures" },
  { id: "WARD", label: "Inpatient Ward" },
  { id: "SURGERY", label: "Operating Theatre" },
  { id: "MEDICINE", label: "Medicine (Pharmacy)" },
];

export default function DoctorOrderModal({
  isOpen,
  onClose,
  patientId,
  encounterId,
  doctorId,
  onOrderSuccess,
}) {
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [availableServices, setAvailableServices] = useState([]);
  const [availableMeds, setAvailableMeds] = useState([]);

  // Selected items in cart
  const [selectedServices, setSelectedServices] = useState([]); // [{ service, quantity, priority, notes }]
  const [selectedMeds, setSelectedMeds] = useState([]); // [{ med, dosage, frequency, route, duration, quantity, instructions }]

  // Medicine custom entry
  const [medForm, setMedForm] = useState({
    medicationName: "",
    dosage: "",
    frequency: "Once daily",
    route: "Oral",
    duration: "7 days",
    quantity: 1,
    instructions: "",
  });

  useEffect(() => {
    if (!isOpen) return;
    async function loadData() {
      setLoading(true);
      setError("");
      try {
        const [srvRes, medRes] = await Promise.all([
          getServices({ isActive: true }),
          getMedications(),
        ]);
        setAvailableServices(srvRes.data || srvRes || []);
        setAvailableMeds(medRes.data || medRes || []);
      } catch {
        setError("Failed to load service catalog and medications.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [isOpen]);

  const handleAddService = (srv) => {
    const existing = selectedServices.find((s) => s.service.id === srv.id);
    if (existing) {
      setSelectedServices(
        selectedServices.map((s) =>
          s.service.id === srv.id ? { ...s, quantity: s.quantity + 1 } : s
        )
      );
    } else {
      setSelectedServices([
        ...selectedServices,
        { service: srv, quantity: 1, priority: "ROUTINE", notes: "" },
      ]);
    }
  };

  const handleRemoveService = (srvId) => {
    setSelectedServices(selectedServices.filter((s) => s.service.id !== srvId));
  };

  const handleServiceChange = (srvId, field, value) => {
    setSelectedServices(
      selectedServices.map((s) =>
        s.service.id === srvId ? { ...s, [field]: value } : s
      )
    );
  };

  const handleAddMedication = () => {
    if (!medForm.medicationName || !medForm.dosage) {
      setError("Please enter medication name and dosage.");
      return;
    }
    setSelectedMeds([...selectedMeds, { ...medForm }]);
    setMedForm({
      medicationName: "",
      dosage: "",
      frequency: "Once daily",
      route: "Oral",
      duration: "7 days",
      quantity: 1,
      instructions: "",
    });
    setError("");
  };

  const handleRemoveMed = (index) => {
    setSelectedMeds(selectedMeds.filter((_, i) => i !== index));
  };

  const totalServicesETB = selectedServices.reduce(
    (sum, item) => sum + parseFloat(item.service.price || 0) * (item.quantity || 1),
    0
  );

  const filteredServices = availableServices.filter((s) => {
    const matchCategory =
      activeCategory === "ALL" || s.category === activeCategory;
    const matchSearch =
      !searchQuery ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.code.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  const handleSubmitOrders = async () => {
    if (selectedServices.length === 0 && selectedMeds.length === 0) {
      setError("Please select at least one service or medication to order.");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        patientId,
        encounterId,
        doctorId,
        services: selectedServices.map((item) => ({
          serviceId: item.service.id,
          quantity: item.quantity,
          priority: item.priority,
          notes: item.notes,
        })),
        medications: selectedMeds.map((med) => ({
          medicationName: med.medicationName,
          dosage: med.dosage,
          frequency: med.frequency,
          route: med.route,
          duration: med.duration,
          quantity: med.quantity,
          instructions: med.instructions,
        })),
      };

      const res = await serviceOrderService.createDoctorOrders(payload);
      setSuccess("Orders submitted successfully!");
      if (onOrderSuccess) {
        onOrderSuccess(res.data || res);
      }
      setTimeout(() => {
        onClose();
        setSelectedServices([]);
        setSelectedMeds([]);
        setSuccess("");
      }, 1200);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to submit orders.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Doctor Order Center — Hospital Services & Medications"
      size="xl"
    >
      <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm font-medium">
            {success}
          </div>
        )}

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-1.5 border-b pb-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeCategory === cat.id
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column: Catalog Browser */}
          <div className="lg:col-span-7 space-y-3">
            {activeCategory !== "MEDICINE" ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    placeholder="Search services by code or name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full text-sm px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                {loading ? (
                  <div className="p-6 text-center text-sm text-gray-500">
                    Loading hospital services catalog...
                  </div>
                ) : filteredServices.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-500 border rounded-lg bg-gray-50">
                    No services found for selected filter.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {filteredServices.map((srv) => {
                      const isAdded = selectedServices.some(
                        (s) => s.service.id === srv.id
                      );
                      return (
                        <div
                          key={srv.id}
                          className={`p-3 border rounded-lg flex items-center justify-between transition ${
                            isAdded
                              ? "bg-indigo-50/60 border-indigo-300"
                              : "bg-white hover:border-gray-300 shadow-xs"
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-gray-900">
                                {srv.name}
                              </span>
                              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                                {srv.code}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {srv.category} • {formatCurrency(srv.price)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddService(srv)}
                            className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                              isAdded
                                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                                : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                            }`}
                          >
                            {isAdded ? "Add More" : "+ Order"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              /* Medicine Prescribing Form */
              <div className="p-4 border rounded-xl bg-slate-50 space-y-3">
                <h4 className="font-semibold text-sm text-slate-800">
                  Prescribe Medication (Pharmacy Direct)
                </h4>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700">
                      Medication Name
                    </label>
                    <input
                      type="text"
                      list="medications-list"
                      placeholder="e.g., Amoxicillin 500mg"
                      value={medForm.medicationName}
                      onChange={(e) =>
                        setMedForm({ ...medForm, medicationName: e.target.value })
                      }
                      className="w-full text-sm px-3 py-1.5 border rounded-lg mt-0.5 bg-white"
                    />
                    <datalist id="medications-list">
                      {availableMeds.map((m) => (
                        <option key={m.id} value={`${m.name} (${m.dosage_form || ""})`} />
                      ))}
                    </datalist>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700">
                        Dosage
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., 500mg"
                        value={medForm.dosage}
                        onChange={(e) =>
                          setMedForm({ ...medForm, dosage: e.target.value })
                        }
                        className="w-full text-sm px-3 py-1.5 border rounded-lg mt-0.5 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700">
                        Frequency
                      </label>
                      <select
                        value={medForm.frequency}
                        onChange={(e) =>
                          setMedForm({ ...medForm, frequency: e.target.value })
                        }
                        className="w-full text-sm px-3 py-1.5 border rounded-lg mt-0.5 bg-white"
                      >
                        <option value="Once daily">Once daily (OD)</option>
                        <option value="Twice daily">Twice daily (BID)</option>
                        <option value="Three times daily">Three times daily (TID)</option>
                        <option value="Four times daily">Four times daily (QID)</option>
                        <option value="Every 8 hours">Every 8 hours</option>
                        <option value="Every 12 hours">Every 12 hours</option>
                        <option value="As needed (PRN)">As needed (PRN)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700">
                        Route
                      </label>
                      <select
                        value={medForm.route}
                        onChange={(e) =>
                          setMedForm({ ...medForm, route: e.target.value })
                        }
                        className="w-full text-sm px-3 py-1.5 border rounded-lg mt-0.5 bg-white"
                      >
                        <option value="Oral">Oral</option>
                        <option value="IV">IV</option>
                        <option value="IM">IM</option>
                        <option value="SC">SC</option>
                        <option value="Topical">Topical</option>
                        <option value="Inhalation">Inhalation</option>
                        <option value="Ophthalmic">Ophthalmic</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700">
                        Duration
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., 5 days"
                        value={medForm.duration}
                        onChange={(e) =>
                          setMedForm({ ...medForm, duration: e.target.value })
                        }
                        className="w-full text-sm px-3 py-1.5 border rounded-lg mt-0.5 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700">
                        Quantity
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={medForm.quantity}
                        onChange={(e) =>
                          setMedForm({
                            ...medForm,
                            quantity: parseInt(e.target.value, 10) || 1,
                          })
                        }
                        className="w-full text-sm px-3 py-1.5 border rounded-lg mt-0.5 bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700">
                      Instructions
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Take after meals with water"
                      value={medForm.instructions}
                      onChange={(e) =>
                        setMedForm({ ...medForm, instructions: e.target.value })
                      }
                      className="w-full text-sm px-3 py-1.5 border rounded-lg mt-0.5 bg-white"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleAddMedication}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-lg transition"
                  >
                    + Add Medication to Prescription Queue
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Order Basket & Clinical Details */}
          <div className="lg:col-span-5 bg-gray-50 border rounded-xl p-4 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between border-b pb-2 mb-3">
                <h4 className="font-semibold text-sm text-gray-900">
                  Order Summary
                </h4>
                <span className="text-xs bg-indigo-100 text-indigo-800 font-semibold px-2 py-0.5 rounded-full">
                  {selectedServices.length + selectedMeds.length} Items
                </span>
              </div>

              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {selectedServices.length === 0 && selectedMeds.length === 0 && (
                  <div className="text-center py-8 text-xs text-gray-400">
                    No services or medicines selected yet.
                  </div>
                )}

                {/* Selected Services */}
                {selectedServices.map((item) => (
                  <div
                    key={item.service.id}
                    className="p-2.5 bg-white border rounded-lg text-xs space-y-2 shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900">
                        {item.service.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveService(item.service.id)}
                        className="text-red-500 hover:text-red-700 font-bold ml-2"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-gray-500">Priority</label>
                        <select
                          value={item.priority}
                          onChange={(e) =>
                            handleServiceChange(
                              item.service.id,
                              "priority",
                              e.target.value
                            )
                          }
                          className="w-full text-xs p-1 border rounded bg-white mt-0.5"
                        >
                          <option value="ROUTINE">Routine</option>
                          <option value="URGENT">Urgent</option>
                          <option value="EMERGENCY">Emergency</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500">Quantity</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) =>
                            handleServiceChange(
                              item.service.id,
                              "quantity",
                              parseInt(e.target.value, 10) || 1
                            )
                          }
                          className="w-full text-xs p-1 border rounded bg-white mt-0.5"
                        />
                      </div>
                    </div>

                    <div>
                      <input
                        type="text"
                        placeholder="Clinical notes / Indication..."
                        value={item.notes}
                        onChange={(e) =>
                          handleServiceChange(
                            item.service.id,
                            "notes",
                            e.target.value
                          )
                        }
                        className="w-full text-xs p-1 border rounded bg-white"
                      />
                    </div>

                    <div className="text-right text-gray-600 font-medium text-[11px]">
                      {formatCurrency(
                        parseFloat(item.service.price || 0) * (item.quantity || 1)
                      )}
                    </div>
                  </div>
                ))}

                {/* Selected Medicines */}
                {selectedMeds.map((med, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-emerald-50/50 border border-emerald-200 rounded-lg text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-emerald-900">
                        💊 {med.medicationName}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveMed(idx)}
                        className="text-red-500 hover:text-red-700 font-bold ml-2"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="text-[11px] text-emerald-800">
                      {med.dosage} • {med.frequency} • {med.route} • {med.duration} (Qty: {med.quantity})
                    </div>
                    {med.instructions && (
                      <div className="text-[10px] text-gray-500 italic">
                        {med.instructions}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Total & Action */}
            <div className="border-t pt-3 space-y-2">
              <div className="flex justify-between items-center text-sm font-semibold text-gray-900">
                <span>Services Total (ETB):</span>
                <span className="text-indigo-600">{formatCurrency(totalServicesETB)}</span>
              </div>
              <p className="text-[11px] text-gray-500 italic">
                * Non-medication services route to Registrar Cashier for payment authorization. Medications route directly to Pharmacy.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-1/2 py-2 border rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmitOrders}
                  disabled={submitting || (selectedServices.length === 0 && selectedMeds.length === 0)}
                  className="w-1/2 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition shadow-xs"
                >
                  {submitting ? "Submitting..." : "Submit All Orders →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
