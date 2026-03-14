import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { Download, ExternalLink, Smartphone, Copy, Check, FileImage } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RiderQRProps {
  orgName?: string;
  orgSlug?: string;
  size?: number;
  showActions?: boolean;
}

export function RiderQR({ orgName = "RydeWorks", orgSlug, size = 200, showActions = true }: RiderQRProps) {
  const [copied, setCopied] = useState(false);

  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
  const riderUrl = orgSlug
    ? `${window.location.origin}${base}/rider?org=${orgSlug}`
    : `${window.location.origin}${base}/rider`;
  const flyerUrl = orgSlug
    ? `${base}/flyer/${orgSlug}`
    : `${base}/flyer/perc`;
  const qrId = `rider-qr-svg-${orgSlug || "default"}`;

  const copy = async () => {
    await navigator.clipboard.writeText(riderUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    const svgEl = document.getElementById(qrId)?.querySelector("svg");
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgData], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${orgSlug || "rydeworks"}-rider-qr.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        id={qrId}
        className="bg-white p-4 rounded-2xl shadow-lg shadow-black/20 ring-1 ring-white/10"
      >
        <QRCodeSVG
          value={riderUrl}
          size={size}
          bgColor="#ffffff"
          fgColor="#0A1628"
          level="H"
          includeMargin={false}
          imageSettings={{
            src: `${window.location.origin}${import.meta.env.BASE_URL}images/logo-mark.png`,
            x: undefined,
            y: undefined,
            height: Math.round(size * 0.18),
            width: Math.round(size * 0.18),
            excavate: true,
          }}
        />
      </div>

      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-white flex items-center justify-center gap-1.5">
          <Smartphone className="w-4 h-4 text-primary" /> Rider Booking Portal
        </p>
        <p className="text-xs text-muted-foreground font-mono truncate max-w-[240px]">{riderUrl}</p>
      </div>

      {showActions && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button size="sm" variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10 rounded-xl" onClick={copy}>
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied!" : "Copy Link"}
          </Button>
          <Button size="sm" variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10 rounded-xl" onClick={download}>
            <Download className="w-4 h-4 mr-1" /> SVG
          </Button>
          <Button size="sm" className="rounded-xl shadow-lg shadow-primary/20" asChild>
            <a href={flyerUrl} target="_blank" rel="noopener noreferrer">
              <FileImage className="w-4 h-4 mr-1" /> Open Flyer
              <ExternalLink className="w-3 h-3 ml-1 opacity-60" />
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}
