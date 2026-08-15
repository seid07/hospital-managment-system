import { useEffect, useState } from "react";

import { searchPatients } from "../../services/patientService";
import { useDebounce } from "../../hooks/useDebounce";

function PatientSearch({ selectedPatient, onSelect }) {
  const [query, setQuery] = useState("");

  const [patients, setPatients] = useState([]);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const debouncedQuery = useDebounce(query, 300);

  const normalizedQuery = debouncedQuery.trim();

  const hasValidQuery = normalizedQuery.length >= 2;

  useEffect(() => {
    if (!hasValidQuery) {
      return undefined;
    }

    let cancelled = false;

    async function search() {
      try {
        setLoading(true);
        setError("");

        const response = await searchPatients(normalizedQuery);

        if (cancelled) {
          return;
        }

        setPatients(response.data || []);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setError(error.message || "Unable to search patients.");

        setPatients([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    search();

    return () => {
      cancelled = true;
    };
  }, [hasValidQuery, normalizedQuery]);

  function handleQueryChange(event) {
    const value = event.target.value;

    setQuery(value);

    if (value.trim().length < 2) {
      setPatients([]);
      setError("");
      setLoading(false);
    }
  }

  function handleSelect(patient) {
    onSelect(patient);
    setQuery("");
    setPatients([]);
    setError("");
  }

  function handleChangePatient() {
    onSelect(null);
    setQuery("");
    setPatients([]);
    setError("");
  }

  return (
    <div className="form-field">
      <label htmlFor="patient-search">Patient</label>

      {selectedPatient ? (
        <div className="selected-patient">
          <div>
            <strong>
              {selectedPatient.first_name} {selectedPatient.last_name}
            </strong>

            <span>{selectedPatient.patient_number}</span>

            <span>{selectedPatient.phone}</span>
          </div>

          <button
            type="button"
            className="button button-secondary"
            onClick={handleChangePatient}
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <input
            id="patient-search"
            type="search"
            placeholder="Search by patient number, name or phone..."
            value={query}
            onChange={handleQueryChange}
            autoComplete="off"
          />

          {loading && <div className="field-hint">Searching patients...</div>}

          {error && (
            <div className="field-error" role="alert">
              {error}
            </div>
          )}

          {patients.length > 0 && (
            <div className="search-results">
              {patients.map((patient) => (
                <button
                  key={patient.id}
                  type="button"
                  className="search-result"
                  onClick={() => handleSelect(patient)}
                >
                  <span className="search-result-name">
                    {patient.first_name} {patient.last_name}
                  </span>

                  <span>{patient.patient_number}</span>

                  <span>{patient.phone}</span>
                </button>
              ))}
            </div>
          )}

          {!loading && hasValidQuery && patients.length === 0 && !error && (
            <div className="field-hint">No patients found.</div>
          )}
        </>
      )}
    </div>
  );
}

export default PatientSearch;
