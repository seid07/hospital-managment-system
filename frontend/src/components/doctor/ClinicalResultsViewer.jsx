import { useState, useEffect } from "react";
import serviceOrderService from "../../services/serviceOrderService";
import StatusBadge from "../common/StatusBadge";

export default function ClinicalResultsViewer({ patientId }) {
  const [activeTab, setActiveTab] = useState("ALL");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!patientId) return;
    async function fetchResults() {
      setLoading(true);
      setError("");
      try {
        const res = await serviceOrderService.getPatientClinicalResults(patientId);
        setResults(res.data || res);
      } catch {
        setError("Failed to load patient clinical results.");
      } finally {
        setLoading(false);
      }
    }
    fetchResults();
  }, [patientId]);

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-gray-500">
        Loading patient diagnostic results & reports...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">
        {error}
      </div>
    );
  }

  const {
    labs = [],
    radiology = [],
    procedures = [],
    surgeries = [],
    nursingNotes = [],
  } = results || {};

  const totalCount =
    labs.length +
    radiology.length +
    procedures.length +
    surgeries.length +
    nursingNotes.length;

  return (
    <div className="space-y-4">
      {/* Category Filter Tabs */}
      <div className="flex flex-wrap gap-2 border-b pb-2">
        <button
          onClick={() => setActiveTab("ALL")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            activeTab === "ALL"
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          All Modalities ({totalCount})
        </button>
        <button
          onClick={() => setActiveTab("LAB")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            activeTab === "LAB"
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          🧪 Laboratory ({labs.length})
        </button>
        <button
          onClick={() => setActiveTab("RADIOLOGY")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            activeTab === "RADIOLOGY"
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          🩻 Radiology ({radiology.length})
        </button>
        <button
          onClick={() => setActiveTab("PROCEDURE")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            activeTab === "PROCEDURE"
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          🩹 Procedures ({procedures.length})
        </button>
        <button
          onClick={() => setActiveTab("SURGERY")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            activeTab === "SURGERY"
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          🏥 Surgery & OT ({surgeries.length})
        </button>
        <button
          onClick={() => setActiveTab("NURSING")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            activeTab === "NURSING"
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          🩺 Nursing Notes ({nursingNotes.length})
        </button>
      </div>

      {/* Results Content */}
      <div className="space-y-4">
        {/* Laboratory Results */}
        {(activeTab === "ALL" || activeTab === "LAB") && labs.length > 0 && (
          <div className="border rounded-xl p-4 bg-white space-y-3">
            <h4 className="font-semibold text-sm text-gray-900 flex items-center gap-2">
              🧪 Laboratory Results
            </h4>
            <div className="divide-y divide-gray-100">
              {labs.map((item) => (
                <div key={item.order_id} className="py-2.5 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-gray-900">
                      {item.test_name} ({item.test_category})
                    </span>
                    <StatusBadge status={item.order_status} />
                  </div>
                  {item.result_value ? (
                    <div className="p-2.5 bg-slate-50 border rounded-lg text-xs space-y-1">
                      <div className="flex items-center gap-4">
                        <div>
                          <span className="text-gray-500">Value:</span>{" "}
                          <span
                            className={`font-bold ${
                              item.is_abnormal ? "text-red-600" : "text-gray-900"
                            }`}
                          >
                            {item.result_value} {item.unit || ""}
                          </span>
                          {item.is_abnormal && (
                            <span className="ml-1 text-[10px] bg-red-100 text-red-700 px-1 py-0.5 rounded font-bold">
                              ABNORMAL
                            </span>
                          )}
                        </div>
                        {item.reference_range && (
                          <div className="text-gray-500">
                            Ref Range: {item.reference_range}
                          </div>
                        )}
                      </div>
                      {item.technician_notes && (
                        <div className="text-gray-600 italic">
                          Notes: {item.technician_notes}
                        </div>
                      )}
                      <div className="text-[10px] text-gray-400">
                        Verified by: {item.verified_by_username || "Lab Technologist"} •{" "}
                        {item.verified_at ? new Date(item.verified_at).toLocaleString() : ""}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-amber-600 italic">
                      Processing in laboratory queue...
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Radiology Reports */}
        {(activeTab === "ALL" || activeTab === "RADIOLOGY") && radiology.length > 0 && (
          <div className="border rounded-xl p-4 bg-white space-y-3">
            <h4 className="font-semibold text-sm text-gray-900 flex items-center gap-2">
              🩻 Radiology Reports (X-Ray / Ultrasound)
            </h4>
            <div className="space-y-3">
              {radiology.map((rad) => (
                <div
                  key={rad.id}
                  className="p-3.5 border rounded-lg bg-slate-50 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-gray-900">
                      {rad.service_name || rad.modality}
                    </span>
                    <StatusBadge status={rad.status} />
                  </div>
                  {rad.clinical_indication && (
                    <div>
                      <span className="font-semibold text-gray-600">
                        Indication:
                      </span>{" "}
                      {rad.clinical_indication}
                    </div>
                  )}
                  {rad.findings && (
                    <div>
                      <span className="font-semibold text-gray-700">Findings:</span>
                      <p className="mt-0.5 text-gray-800 whitespace-pre-wrap">
                        {rad.findings}
                      </p>
                    </div>
                  )}
                  {rad.impression && (
                    <div className="p-2 bg-indigo-50 border border-indigo-100 rounded text-indigo-900">
                      <span className="font-bold">Impression:</span> {rad.impression}
                    </div>
                  )}
                  {rad.recommendations && (
                    <div>
                      <span className="font-semibold text-gray-700">
                        Recommendations:
                      </span>{" "}
                      {rad.recommendations}
                    </div>
                  )}
                  <div className="text-[10px] text-gray-400 pt-1 border-t">
                    Reported by: {rad.reported_by_username || "Radiologist"} •{" "}
                    {rad.reported_at ? new Date(rad.reported_at).toLocaleString() : "Pending"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Procedures */}
        {(activeTab === "ALL" || activeTab === "PROCEDURE") && procedures.length > 0 && (
          <div className="border rounded-xl p-4 bg-white space-y-3">
            <h4 className="font-semibold text-sm text-gray-900 flex items-center gap-2">
              🩹 Clinical Procedures
            </h4>
            <div className="space-y-2">
              {procedures.map((proc) => (
                <div
                  key={proc.id}
                  className="p-3 border rounded-lg bg-slate-50 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900">
                      {proc.procedure_name || proc.procedure_type}
                    </span>
                    <StatusBadge status={proc.status} />
                  </div>
                  {proc.procedure_notes && (
                    <p className="text-gray-700">{proc.procedure_notes}</p>
                  )}
                  <div className="text-[10px] text-gray-400">
                    Performed by: {proc.performed_by_username || "Clinical Staff"} •{" "}
                    {proc.performed_at ? new Date(proc.performed_at).toLocaleString() : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Surgery & Operating Theatre */}
        {(activeTab === "ALL" || activeTab === "SURGERY") && surgeries.length > 0 && (
          <div className="border rounded-xl p-4 bg-white space-y-3">
            <h4 className="font-semibold text-sm text-gray-900 flex items-center gap-2">
              🏥 Operating Theatre Records
            </h4>
            <div className="space-y-3">
              {surgeries.map((surg) => (
                <div
                  key={surg.id}
                  className="p-3.5 border rounded-lg bg-slate-50 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900">
                      {surg.surgery_name}
                    </span>
                    <StatusBadge status={surg.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-gray-600">
                    <div>
                      <span className="font-semibold">Pre-Op Diagnosis:</span>{" "}
                      {surg.pre_op_diagnosis || "—"}
                    </div>
                    <div>
                      <span className="font-semibold">Post-Op Diagnosis:</span>{" "}
                      {surg.post_op_diagnosis || "—"}
                    </div>
                  </div>
                  {surg.intra_op_findings && (
                    <div>
                      <span className="font-semibold text-gray-700">
                        Intra-Op Findings:
                      </span>
                      <p className="mt-0.5 text-gray-800">{surg.intra_op_findings}</p>
                    </div>
                  )}
                  {surg.operation_notes && (
                    <div>
                      <span className="font-semibold text-gray-700">
                        Operation Notes:
                      </span>
                      <p className="mt-0.5 text-gray-800">{surg.operation_notes}</p>
                    </div>
                  )}
                  {surg.post_op_instructions && (
                    <div className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-900">
                      <span className="font-semibold">Post-Op Instructions:</span>{" "}
                      {surg.post_op_instructions}
                    </div>
                  )}
                  <div className="text-[10px] text-gray-400 pt-1 border-t">
                    Surgeon / Performed by: {surg.performed_by_username || "Surgical Team"} •{" "}
                    Destination: {surg.recovery_destination || "Ward"} •{" "}
                    {surg.completed_at ? new Date(surg.completed_at).toLocaleString() : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Nursing Clinical Notes */}
        {(activeTab === "ALL" || activeTab === "NURSING") && nursingNotes.length > 0 && (
          <div className="border rounded-xl p-4 bg-white space-y-3">
            <h4 className="font-semibold text-sm text-gray-900 flex items-center gap-2">
              🩺 Nursing Notes
            </h4>
            <div className="space-y-2">
              {nursingNotes.map((note) => (
                <div
                  key={note.id}
                  className="p-3 border rounded-lg bg-slate-50 space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between text-gray-500">
                    <span className="font-semibold text-indigo-700 uppercase">
                      [{note.category}]
                    </span>
                    <span>{new Date(note.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-gray-800">{note.note}</p>
                  <div className="text-[10px] text-gray-400">
                    Recorded by Nurse {note.nurse_first_name} {note.nurse_last_name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {totalCount === 0 && (
          <div className="p-8 text-center text-sm text-gray-400 border rounded-xl bg-gray-50">
            No diagnostic results or clinical reports recorded for this patient yet.
          </div>
        )}
      </div>
    </div>
  );
}
