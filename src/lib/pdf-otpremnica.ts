import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { LOGO_BASE64 } from "@/lib/logo-base64";

interface OtpremnicaPDFData {
  doc_number: string;
  date: string;
  recipient_name: string;
  recipient_address: string;
  project_name?: string;
  location_code: string;
  issued_by: string;
  received_by: string;
  items: { index: number; code: string; name: string; unit: string; quantity: number }[];
  company: {
    name: string;
    oib: string;
    address: string;
    city: string;
  };
}

export function generateOtpremnicaPDF(data: OtpremnicaPDFData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  // Logo
  try {
    doc.addImage(LOGO_BASE64, "SVG", margin, y, 40, 20);
  } catch {
    // fallback if SVG fails
  }

  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("OTPREMNICA", pageWidth - margin, y + 8, { align: "right" });

  // Company info
  y += 25;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(data.company.name, margin, y);
  doc.text(`Broj: ${data.doc_number}`, pageWidth - margin, y, { align: "right" });
  y += 5;
  doc.text(`OIB: ${data.company.oib}`, margin, y);
  doc.text(`Datum: ${formatDate(data.date)}`, pageWidth - margin, y, { align: "right" });
  y += 5;
  doc.text(`${data.company.address}, ${data.company.city}`, margin, y);

  // Separator
  y += 8;
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);

  // Recipient + Project
  y += 7;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Primatelj:", margin, y);
  doc.text("Projekt / Lokacija:", pageWidth / 2, y);

  y += 5;
  doc.setFont("helvetica", "normal");
  doc.text(data.recipient_name || "-", margin, y);
  const projectLoc = [data.project_name, data.location_code].filter(Boolean).join(" / Lok. ");
  doc.text(projectLoc || "-", pageWidth / 2, y);

  y += 5;
  if (data.recipient_address) {
    doc.text(data.recipient_address, margin, y);
    y += 5;
  }

  // Separator
  y += 3;
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  // Items table
  autoTable(doc, {
    startY: y,
    head: [["Rb.", "Sifra", "Naziv", "JMJ", "Kolicina"]],
    body: data.items.map(item => [
      item.index.toString(),
      item.code,
      item.name,
      item.unit,
      item.quantity.toString(),
    ]),
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [33, 152, 130], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 30 },
      2: { cellWidth: "auto" },
      3: { cellWidth: 18, halign: "center" },
      4: { cellWidth: 22, halign: "right" },
    },
  });

  // Signatures
  const finalY = (doc as any).lastAutoTable?.finalY || y + 40;
  const sigY = finalY + 20;

  doc.setDrawColor(150);
  doc.line(margin, sigY, margin + 60, sigY);
  doc.line(pageWidth - margin - 60, sigY, pageWidth - margin, sigY);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("Izdao:", margin, sigY + 5);
  doc.text("Primio:", pageWidth - margin - 60, sigY + 5);

  if (data.issued_by) {
    doc.setFont("helvetica", "bold");
    doc.text(data.issued_by, margin, sigY + 10);
  }
  if (data.received_by) {
    doc.setFont("helvetica", "bold");
    doc.text(data.received_by, pageWidth - margin - 60, sigY + 10);
  }

  doc.save(`${data.doc_number}.pdf`);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}.${d.getFullYear()}.`;
}
