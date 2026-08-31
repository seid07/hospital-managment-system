import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { CheckCircle, AlertTriangle, XCircle, Loader2, ArrowRight, ShieldCheck, Mail } from "lucide-react";
import { verifyStaffEmail } from "../services/staffService";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [status, setStatus] = useState("VERIFYING"); // VERIFYING | SUCCESS | EXPIRED | INVALID
  const [message, setMessage] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function processVerification() {
      if (!token) {
        if (isMounted) {
          setStatus("INVALID");
          setMessage("No verification token found in URL. Please use the complete link provided in your email.");
        }
        return;
      }

      try {
        const res = await verifyStaffEmail(token);
        if (isMounted) {
          setStatus("SUCCESS");
          setVerifiedEmail(res.email || "");
          setMessage(res.message || "Email address verified successfully.");
        }
      } catch (err) {
        if (isMounted) {
          const errMsg = err.message || "";
          if (errMsg.toLowerCase().includes("expired")) {
            setStatus("EXPIRED");
            setMessage("This verification link has expired (links are valid for 30 minutes). Please ask your hospital administrator to resend a verification link.");
          } else {
            setStatus("INVALID");
            setMessage(errMsg || "This verification link is invalid or has already been used.");
          }
        }
      }
    }

    processVerification();

    return () => {
      isMounted = false;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Background glowing effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main card */}
      <div className="w-full max-w-md bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl p-8 relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400 mb-4 shadow-inner">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-50 tracking-tight">Staff Email Verification</h1>
          <p className="text-sm text-slate-400 mt-1">Hospital Management System Security</p>
        </div>

        {/* State: Verifying */}
        {status === "VERIFYING" && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Loader2 className="w-12 h-12 text-teal-400 animate-spin mb-4" />
            <h2 className="text-lg font-semibold text-slate-200">Verifying Email Ownership...</h2>
            <p className="text-xs text-slate-400 mt-2 max-w-xs leading-relaxed">
              Validating your one-time cryptographic token with hospital identity services.
            </p>
          </div>
        )}

        {/* State: Success */}
        {status === "SUCCESS" && (
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 shadow-lg">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-emerald-400">Email Verified Successfully!</h2>
            {verifiedEmail && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-800 border border-slate-700 rounded-full text-xs font-mono text-slate-300 my-3">
                <Mail className="w-3.5 h-3.5 text-teal-400" />
                <span>{verifiedEmail}</span>
              </div>
            )}
            <p className="text-sm text-slate-300 mt-2 leading-relaxed">
              {message || "Your email address has been confirmed."}
            </p>
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 my-6 text-left w-full text-xs text-slate-400">
              <p className="font-semibold text-slate-200 mb-1">What happens next?</p>
              <ul className="list-disc list-inside space-y-1 text-slate-400">
                <li>The System Administrator can now finalize your staff account.</li>
                <li>Your temporary login credentials will be delivered to this verified mailbox.</li>
                <li>You will be required to set a permanent password upon first login.</li>
              </ul>
            </div>

            <div className="w-full space-y-3">
              <button
                onClick={() => navigate("/login")}
                className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-400 hover:to-teal-500 text-slate-950 font-semibold py-3 px-4 rounded-xl transition-all shadow-lg shadow-teal-500/20"
              >
                <span>Go to Staff Login</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* State: Expired */}
        {status === "EXPIRED" && (
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 shadow-lg">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-amber-400">Verification Link Expired</h2>
            <p className="text-sm text-slate-300 mt-3 leading-relaxed">
              {message}
            </p>
            <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-4 my-6 text-left w-full text-xs text-amber-200/80">
              <p className="font-semibold text-amber-300 mb-1">Security Expiration Note:</p>
              <p>For your protection, email verification links expire after 30 minutes. Please contact hospital IT or your administrator to issue a new verification link.</p>
            </div>

            <div className="w-full space-y-3">
              <Link
                to="/login"
                className="w-full inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium py-3 px-4 rounded-xl transition-all"
              >
                <span>Return to Login</span>
              </Link>
            </div>
          </div>
        )}

        {/* State: Invalid */}
        {status === "INVALID" && (
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4 shadow-lg">
              <XCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-rose-400">Invalid Verification Link</h2>
            <p className="text-sm text-slate-300 mt-3 leading-relaxed">
              {message}
            </p>
            <div className="bg-rose-950/30 border border-rose-800/40 rounded-xl p-4 my-6 text-left w-full text-xs text-rose-200/80">
              <p className="font-semibold text-rose-300 mb-1">Possible Reasons:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>This link has already been used to verify an account.</li>
                <li>The verification token has been superseded by a newer link.</li>
                <li>The URL was truncated or copied incompletely.</li>
              </ul>
            </div>

            <div className="w-full space-y-3">
              <Link
                to="/login"
                className="w-full inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium py-3 px-4 rounded-xl transition-all"
              >
                <span>Return to Login</span>
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-8 text-center text-xs text-slate-500 relative z-10">
        &copy; {new Date().getFullYear()} Hospital Management System. All rights reserved.
      </footer>
    </div>
  );
}
