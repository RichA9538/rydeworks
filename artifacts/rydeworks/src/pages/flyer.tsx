import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Printer, Download, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

async function fetchOrgPublic(slug: string) {
  const res = await fetch(`/api/rider-portal/org/${slug}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.org;
}

/* ── PERC custom flyer ─────────────────────────────────── */
function PERCFlyer({ riderUrl }: { riderUrl: string }) {
  const GREEN  = "#1a5c2b";
  const GOLD   = "#d4a800";
  const LGOLD  = "#f5d800";

  return (
    <div style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", color: "#111", background: "#fff" }}>

      {/* ── Original flyer image ─────────────────────────── */}
      <img
        src={`${import.meta.env.BASE_URL}perc/flyer.jpg`}
        alt="ZAK Transportation Initiative Flyer"
        style={{ width: "100%", display: "block" }}
      />

      {/* ── QR "Book Online" extension band ───────────────── */}
      <div style={{ background: GREEN }}>

        {/* Gold accent stripe */}
        <div style={{ height: 6, background: GOLD }} />

        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          padding: "28px 40px",
        }}>

          {/* Left: headline + instructions */}
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: GOLD,
              marginBottom: 6,
            }}>Book Online — Anytime, Anywhere</div>
            <div style={{
              fontSize: 28,
              fontWeight: 900,
              color: "#fff",
              lineHeight: 1.15,
              marginBottom: 12,
            }}>
              Scan to Request<br />Your Ride
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { n: "1", t: "Open your phone camera" },
                { n: "2", t: "Point at the QR code" },
                { n: "3", t: "Tap the link & enter your number" },
              ].map(({ n, t }) => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: GOLD, color: GREEN,
                    fontWeight: 800, fontSize: 12,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>{n}</div>
                  <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}>{t}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Center: QR code */}
          <div style={{
            padding: 14,
            background: "#fff",
            borderRadius: 16,
            boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
            flexShrink: 0,
          }}>
            <QRCodeSVG
              value={riderUrl}
              size={150}
              bgColor="#ffffff"
              fgColor={GREEN}
              level="H"
              includeMargin={false}
              imageSettings={{
                src: `${window.location.origin}${import.meta.env.BASE_URL}images/logo-mark.png`,
                x: undefined,
                y: undefined,
                height: 28,
                width: 28,
                excavate: true,
              }}
            />
            <div style={{
              fontSize: 9,
              color: "#64748b",
              textAlign: "center",
              marginTop: 6,
              fontFamily: "monospace",
              wordBreak: "break-all",
              maxWidth: 150,
            }}>{riderUrl}</div>
          </div>

          {/* Right: Powered by RydeWorks + A&A attribution */}
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, marginBottom: 8, letterSpacing: "0.06em" }}>
              TECHNOLOGY BY
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", marginBottom: 8 }}>
              <img
                src={`${import.meta.env.BASE_URL}images/logo-mark.png`}
                alt="RydeWorks"
                style={{ width: 26, height: 26, objectFit: "contain", filter: "brightness(0) invert(1)" }}
              />
              <span style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>RydeWorks</span>
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginBottom: 10, textAlign: "right" }}>
              A DBA of Alvarez & Associates
            </div>
            <div style={{
              fontSize: 11, color: LGOLD, lineHeight: 1.5,
              maxWidth: 180, textAlign: "right",
            }}>
              Dispatch technology<br />for nonprofits nationwide
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
              rydeworks.com
            </div>
          </div>
        </div>

        {/* Gold accent stripe */}
        <div style={{ height: 6, background: GOLD }} />
      </div>
    </div>
  );
}

/* ── Generic fallback flyer ──────────────────────────────── */
function GenericFlyer({ org, riderUrl }: { org: any; riderUrl: string }) {
  const primary = org?.primaryColor || "#00D4C8";
  const orgName  = org?.name || "RydeWorks";

  return (
    <div style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", color: "#0f172a", background: "#fff" }}>
      <div style={{ padding: "48px 48px 40px", textAlign: "center", background: primary }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px", marginBottom: 6 }}>RydeWorks</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{orgName}</div>
      </div>
      <div style={{ padding: "40px 48px", display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        <div style={{ fontSize: 30, fontWeight: 800, textAlign: "center" }}>Need a Ride?</div>
        <div style={{ padding: 16, background: "#fff", borderRadius: 20, boxShadow: "0 4px 24px rgba(0,0,0,0.1)", border: "2px solid #e2e8f0" }}>
          <QRCodeSVG value={riderUrl} size={200} bgColor="#ffffff" fgColor="#0f172a" level="H" includeMargin={false} />
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace", wordBreak: "break-all", textAlign: "center" }}>{riderUrl}</div>
      </div>
      <div style={{ padding: "16px 48px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", textAlign: "center", fontSize: 11, color: "#94a3b8" }}>
        RydeWorks · A DBA of Alvarez & Associates · rydeworks.com
      </div>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────── */
export default function FlyerPage() {
  const params = useParams<{ orgSlug: string }>();
  const slug = params.orgSlug || "perc";

  const { data: org, isLoading, error } = useQuery({
    queryKey: ["public-org", slug],
    queryFn: () => fetchOrgPublic(slug),
    retry: 1,
  });

  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
  const riderUrl = `${window.location.origin}${base}/rider?org=${slug}`;

  const print = () => window.print();

  const downloadQR = () => {
    const svgEl = document.querySelector("#flyer-page svg") as SVGSVGElement | null;
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgData], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}-rider-qr.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error && !org) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 text-center px-6">
        <p className="text-white font-semibold text-lg">Organization not found</p>
        <p className="text-muted-foreground text-sm">No org with slug <code className="text-primary font-mono">{slug}</code> exists.</p>
        <Link href="/">
          <Button variant="outline" className="rounded-full border-white/10 mt-2">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to home
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Screen toolbar */}
      <div className="print:hidden fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-white/5 h-14 flex items-center justify-between px-6">
        <Link href="/admin/org">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-white rounded-full">
            <ArrowLeft className="w-4 h-4 mr-2" /> Admin
          </Button>
        </Link>
        <span className="text-sm text-muted-foreground font-medium">
          {org?.name || slug.toUpperCase()} · Rider Flyer
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="rounded-full bg-white/5 border-white/10 hover:bg-white/10" onClick={downloadQR}>
            <Download className="w-4 h-4 mr-1.5" /> Download QR
          </Button>
          <Button size="sm" className="rounded-full shadow-lg shadow-primary/20" onClick={print}>
            <Printer className="w-4 h-4 mr-1.5" /> Print Flyer
          </Button>
        </div>
      </div>

      <style>{`
        @media print {
          @page { margin: 0; size: letter portrait; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>

      {/* Flyer content */}
      <div id="flyer-page" className="print:pt-0 pt-14 bg-white min-h-screen">
        <div className="max-w-[800px] mx-auto">
          {slug === "perc"
            ? <PERCFlyer riderUrl={riderUrl} />
            : <GenericFlyer org={org} riderUrl={riderUrl} />
          }
        </div>
      </div>
    </>
  );
}
