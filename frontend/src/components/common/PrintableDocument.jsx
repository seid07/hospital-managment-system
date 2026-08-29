import { useState } from "react";
import { Printer, FileText, Receipt, Check } from "lucide-react";

/**
 * PrintableDocument
 * Provides multi-format printing support:
 * 1. "standard": A4 / Full Page / PDF style with blue branding and full tables
 * 2. "thermal": 80mm POS Thermal Receipt paper style with compact monospace dot-matrix design
 */
function PrintableDocument({
  title,
  subtitle,
  documentNumber,
  date,
  children,
  onPrint,
  defaultFormat = "thermal", // "thermal" | "standard"
  hospitalName = "HOSPITAL MANAGEMENT SYSTEM",
  hospitalAddress = "Clinical & Patient Care Operations",
  hospitalPhone = "Tel: +251 11 000 0000",
  cashierName,
}) {
  const [paperFormat, setPaperFormat] = useState(defaultFormat);

  function handlePrint() {
    // Add print format class to body for specific @media print rules
    if (paperFormat === "thermal") {
      document.body.classList.add("printing-thermal");
      document.body.classList.remove("printing-standard");
    } else {
      document.body.classList.add("printing-standard");
      document.body.classList.remove("printing-thermal");
    }

    const cleanup = () => {
      document.body.classList.remove("printing-thermal");
      document.body.classList.remove("printing-standard");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);

    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }

    // Safety fallback cleanup
    setTimeout(cleanup, 2000);
  }

  const currentDate = date || new Date().toLocaleString();

  return (
    <div
      className={`printable-container format-${paperFormat}`}
      style={{
        background: paperFormat === "thermal" ? "#0f172a" : "#ffffff",
        padding: paperFormat === "thermal" ? "18px 12px" : "24px",
        borderRadius: "var(--radius, 8px)",
        border: "1px solid var(--border, #e2e8f0)",
        transition: "background 0.2s ease",
      }}
    >
      {/* Print & Format Toolbar (hidden during print) */}
      <div
        className="print-hide printable-toolbar"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "18px",
          paddingBottom: "14px",
          borderBottom: paperFormat === "thermal" ? "1px solid #334155" : "1px solid #e2e8f0",
        }}
      >
        {/* Paper Format Switcher */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", fontWeight: 600, color: paperFormat === "thermal" ? "#94a3b8" : "#64748b" }}>
            Paper Style:
          </span>
          <div
            style={{
              display: "inline-flex",
              background: paperFormat === "thermal" ? "#1e293b" : "#f1f5f9",
              padding: "3px",
              borderRadius: "8px",
              border: paperFormat === "thermal" ? "1px solid #334155" : "1px solid #cbd5e1",
              gap: "4px",
            }}
          >
            <button
              type="button"
              onClick={() => setPaperFormat("standard")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                background: paperFormat === "standard" ? "#ffffff" : "transparent",
                color: paperFormat === "standard" ? "#0284c7" : paperFormat === "thermal" ? "#94a3b8" : "#64748b",
                boxShadow: paperFormat === "standard" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}
            >
              <FileText size={14} /> 📄 Standard PDF / A4
              {paperFormat === "standard" && <Check size={13} style={{ marginLeft: "2px" }} />}
            </button>

            <button
              type="button"
              onClick={() => setPaperFormat("thermal")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                background: paperFormat === "thermal" ? "#3b82f6" : "transparent",
                color: paperFormat === "thermal" ? "#ffffff" : "#64748b",
                boxShadow: paperFormat === "thermal" ? "0 1px 4px rgba(0,0,0,0.25)" : "none",
              }}
            >
              <Receipt size={14} /> 🧾 Thermal POS Receipt (80mm)
              {paperFormat === "thermal" && <Check size={13} style={{ marginLeft: "2px" }} />}
            </button>
          </div>
        </div>

        {/* Action Button */}
        <div>
          <button
            type="button"
            className="button button-primary"
            onClick={handlePrint}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 16px",
              fontWeight: 700,
              fontSize: "13px",
            }}
          >
            <Printer size={16} />
            {paperFormat === "thermal" ? "Print Thermal Slip (80mm)" : "Print Document (A4 / PDF)"}
          </button>
        </div>
      </div>

      {/* DOCUMENT PREVIEWS */}
      {paperFormat === "standard" ? (
        /* STANDARD A4 / PDF FORMAT */
        <div className="printable-document printable-standard" style={{ color: "#172033" }}>
          <div
            style={{
              borderBottom: "2px solid #1769aa",
              paddingBottom: "12px",
              marginBottom: "20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: "20px", color: "#1769aa", fontWeight: 800, letterSpacing: "-0.3px" }}>
                {hospitalName}
              </h1>
              <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#637083" }}>
                {hospitalAddress}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#8a96a6" }}>
                {hospitalPhone}
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{title}</h2>
              {subtitle && <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#637083" }}>{subtitle}</p>}
              {documentNumber && (
                <p style={{ margin: "2px 0 0", fontSize: "12px", fontWeight: 600, color: "#1769aa" }}>
                  Ref: {documentNumber}
                </p>
              )}
              {currentDate && <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#8a96a6" }}>Date: {currentDate}</p>}
            </div>
          </div>

          <div className="printable-content">{children}</div>

          <div
            style={{
              marginTop: "32px",
              borderTop: "1px solid #dfe6ee",
              paddingTop: "12px",
              display: "flex",
              justifyContent: "space-between",
              fontSize: "11px",
              color: "#8a96a6",
            }}
          >
            <span>Generated by Hospital Information System</span>
            <span>Confidential Medical & Billing Document</span>
          </div>
        </div>
      ) : (
        /* THERMAL RECEIPT 80mm POS FORMAT */
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div
            className="printable-document printable-thermal"
            style={{
              width: "100%",
              maxWidth: "320px",
              background: "#ffffff",
              color: "#000000",
              padding: "18px 14px",
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: "11.5px",
              lineHeight: "1.35",
              boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
              borderRadius: "2px",
            }}
          >
            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: "10px" }}>
              <div style={{ fontSize: "14px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                *** {hospitalName} ***
              </div>
              <div style={{ fontSize: "10.5px", marginTop: "2px" }}>{hospitalAddress}</div>
              <div style={{ fontSize: "10.5px" }}>{hospitalPhone}</div>
              <div style={{ borderTop: "1px dashed #000000", margin: "8px 0" }} />
              <div style={{ fontSize: "13px", fontWeight: 800, textTransform: "uppercase" }}>
                {title}
              </div>
              {subtitle && <div style={{ fontSize: "10.5px", fontStyle: "italic" }}>{subtitle}</div>}
              {documentNumber && (
                <div style={{ fontSize: "11.5px", fontWeight: 700, marginTop: "2px" }}>
                  RECEIPT #: {documentNumber}
                </div>
              )}
              <div style={{ fontSize: "10px", marginTop: "2px" }}>
                DATE: {currentDate}
              </div>
              {cashierName && (
                <div style={{ fontSize: "10px" }}>
                  CASHIER: {cashierName}
                </div>
              )}
              <div style={{ borderTop: "1px dashed #000000", margin: "8px 0" }} />
            </div>

            {/* Thermal Content Container */}
            <div className="thermal-content-wrapper" style={{ fontSize: "11.5px" }}>
              {children}
            </div>

            {/* Thermal Footer */}
            <div style={{ borderTop: "1px dashed #000000", margin: "10px 0 6px 0" }} />
            <div style={{ textAlign: "center", fontSize: "10.5px" }}>
              <div style={{ fontWeight: 800 }}>*** THANK YOU ***</div>
              <div style={{ fontSize: "10px", marginTop: "2px" }}>WISHING YOU SPEEDY RECOVERY</div>
              <div style={{ borderTop: "1px dotted #000000", margin: "6px 0" }} />
              <div style={{ fontSize: "9px", letterSpacing: "2px", fontWeight: 700 }}>
                * * * * * * * * * * * * *
              </div>
              <div style={{ fontSize: "8.5px", marginTop: "2px", color: "#555" }}>
                VALID OFFICIAL HOSPITAL RECEIPT
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PrintableDocument;
