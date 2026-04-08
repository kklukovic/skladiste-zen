import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { LOGO_BASE64 } from "@/lib/logo-base64";
import { ROBOTO_REGULAR_BASE64 } from "@/lib/roboto-regular-base64";
import { ROBOTO_BOLD_BASE64 } from "@/lib/roboto-bold-base64";

function setupCroatianFont(doc: jsPDF) {
  doc.addFileToVFS("Roboto-Regular.ttf", ROBOTO_REGULAR_BASE64);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.addFileToVFS("Roboto-Bold.ttf", ROBOTO_BOLD_BASE64);
  doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");
  doc.setFont("Roboto", "normal");
}

export function formatDateHR(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}.${d.getFullYear()}.`;
}

interface DocumentPDFData {
  title: string;
  doc_number: string;
  date: string;
  leftLabel1: string;
  leftValue1: string;
  leftLabel2?: string;
  leftValue2?: string;
  rightLabel: string;
  rightValue: string;
  sigLeftLabel: string;
  sigLeftValue: string;
  sigRightLabel: string;
  sigRightValue: string;
  items: { index: number; code: string; name: string; unit: string; quantity: number }[];
  company: { name: string; oib: string; address: string; city: string };
}

export function generateDocumentPDF(data: DocumentPDFData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  setupCroatianFont(doc);
  const pw = doc.internal.pageSize.getWidth();
  const m = 15;
  let y = m;

  try { doc.addImage(LOGO_BASE64, "JPEG", m, y, 50, 15); } catch {}

  doc.setFontSize(18);
  doc.setFont("Roboto", "bold");
  doc.text(data.title, pw - m, y + 8, { align: "right" });

  y += 25;
  doc.setFontSize(9);
  doc.setFont("Roboto", "normal");
  doc.text(data.company.name, m, y);
  doc.text(`Broj: ${data.doc_number}`, pw - m, y, { align: "right" });
  y += 5;
  doc.text(`OIB: ${data.company.oib}`, m, y);
  doc.text(`Datum: ${formatDateHR(data.date)}`, pw - m, y, { align: "right" });
  y += 5;
  doc.text(`${data.company.address}, ${data.company.city}`, m, y);

  y += 8;
  doc.setDrawColor(200);
  doc.line(m, y, pw - m, y);

  y += 7;
  doc.setFont("Roboto", "bold");
  doc.text(`${data.leftLabel1}:`, m, y);
  doc.text(`${data.rightLabel}:`, pw / 2, y);
  y += 5;
  doc.setFont("Roboto", "normal");
  doc.text(data.leftValue1 || "-", m, y);
  doc.text(data.rightValue || "-", pw / 2, y);
  if (data.leftLabel2 && data.leftValue2) {
    y += 5;
    doc.text(data.leftValue2, m, y);
  }

  y += 8;
  doc.line(m, y, pw - m, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    head: [["Rb.", "Šifra", "Naziv", "JMJ", "Količina"]],
    body: data.items.map(item => [
      item.index.toString(), item.code, item.name, item.unit, item.quantity.toString(),
    ]),
    margin: { left: m, right: m },
    styles: { fontSize: 9, cellPadding: 3, font: "Roboto" },
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

  const finalY = (doc as any).lastAutoTable?.finalY || y + 40;
  const sigY = finalY + 20;
  doc.setDrawColor(150);
  doc.line(m, sigY, m + 60, sigY);
  doc.line(pw - m - 60, sigY, pw - m, sigY);
  doc.setFontSize(8);
  doc.setFont("Roboto", "normal");
  doc.text(`${data.sigLeftLabel}:`, m, sigY + 5);
  doc.text(`${data.sigRightLabel}:`, pw - m - 60, sigY + 5);
  if (data.sigLeftValue) { doc.setFont("Roboto", "bold"); doc.text(data.sigLeftValue, m, sigY + 10); }
  if (data.sigRightValue) { doc.setFont("Roboto", "bold"); doc.text(data.sigRightValue, pw - m - 60, sigY + 10); }

  doc.save(`${data.doc_number}.pdf`);
}

export function generateInventoryPDF(data: {
  company: { name: string; oib: string; address: string; city: string };
  items: { code: string; name: string; unit: string; qty: number; price: number; value: number }[];
  totalValue: number;
  locationName?: string;
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  setupCroatianFont(doc);
  const pw = doc.internal.pageSize.getWidth();
  const m = 15;
  let y = m;

  try { doc.addImage(LOGO_BASE64, "JPEG", m, y, 50, 15); } catch {}

  doc.setFontSize(16);
  doc.setFont("Roboto", "bold");
  doc.text("INVENTURNA LISTA", pw - m, y + 8, { align: "right" });

  y += 25;
  doc.setFontSize(9);
  doc.setFont("Roboto", "normal");
  doc.text(data.company.name, m, y);
  y += 5;
  doc.text(`OIB: ${data.company.oib}`, m, y);
  y += 5;
  doc.text(`${data.company.address}, ${data.company.city}`, m, y);
  y += 5;
  const now = new Date();
  doc.text(`Stanje na dan: ${formatDateHR(now.toISOString())} ${now.toLocaleTimeString("hr")}`, m, y);
  if (data.locationName) {
    doc.text(`Lokacija: ${data.locationName}`, pw - m, y, { align: "right" });
  }

  y += 8;
  doc.setDrawColor(200);
  doc.line(m, y, pw - m, y);
  y += 5;

  const bodyRows = data.items.map((item, i) => [
    (i + 1).toString(), item.code, item.name, item.unit,
    item.qty.toFixed(2), item.price.toFixed(2), item.value.toFixed(2),
  ]);
  bodyRows.push(["", "", "", "", "", "UKUPNO:", data.totalValue.toFixed(2) + " EUR"]);

  autoTable(doc, {
    startY: y,
    head: [["Rb.", "Šifra", "Naziv", "JMJ", "Količina", "Nab. cijena", "Vrijednost"]],
    body: bodyRows,
    margin: { left: m, right: m },
    styles: { fontSize: 8, cellPadding: 2.5, font: "Roboto" },
    headStyles: { fillColor: [33, 152, 130], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || y + 40;
  const sigY = finalY + 25;
  doc.setDrawColor(150);
  doc.line(m, sigY, m + 70, sigY);
  doc.setFontSize(8);
  doc.text("Odgovorna osoba: _______________", m, sigY + 5);

  doc.save(`inventurna_lista_${now.toISOString().slice(0, 10)}.pdf`);
}

export function generateProjectReportPDF(data: {
  company: { name: string; oib: string; address: string; city: string };
  project: { name: string; address?: string; status: string; period: string };
  items: { code: string; name: string; unit: string; issued: number; returned: number; net: number }[];
  totals: { issued: number; returned: number; net: number };
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  setupCroatianFont(doc);
  const pw = doc.internal.pageSize.getWidth();
  const m = 15;
  let y = m;

  try { doc.addImage(LOGO_BASE64, "JPEG", m, y, 50, 15); } catch {}

  doc.setFontSize(14);
  doc.setFont("Roboto", "bold");
  doc.text("IZVJEŠTAJ PO PROJEKTU", pw - m, y + 8, { align: "right" });

  y += 25;
  doc.setFontSize(9);
  doc.setFont("Roboto", "normal");
  doc.text(data.company.name, m, y);
  y += 5;
  doc.text(`OIB: ${data.company.oib}`, m, y);
  y += 5;
  doc.text(`${data.company.address}, ${data.company.city}`, m, y);

  y += 10;
  doc.setFont("Roboto", "bold");
  doc.text(`Projekt: ${data.project.name}`, m, y);
  y += 5;
  doc.setFont("Roboto", "normal");
  if (data.project.address) { doc.text(`Adresa: ${data.project.address}`, m, y); y += 5; }
  doc.text(`Razdoblje: ${data.project.period}`, m, y);
  y += 5;
  doc.text(`Datum izvještaja: ${formatDateHR(new Date().toISOString())}`, m, y);

  y += 8;
  doc.setDrawColor(200);
  doc.line(m, y, pw - m, y);
  y += 5;

  const bodyRows = data.items.map((item, i) => [
    (i + 1).toString(), item.code, item.name, item.unit,
    item.issued.toFixed(2), item.returned.toFixed(2), item.net.toFixed(2),
  ]);
  bodyRows.push(["", "", "UKUPNO", "", data.totals.issued.toFixed(2), data.totals.returned.toFixed(2), data.totals.net.toFixed(2)]);

  autoTable(doc, {
    startY: y,
    head: [["Rb.", "Šifra", "Naziv", "JMJ", "Izdano", "Vraćeno", "Neto utrošak"]],
    body: bodyRows,
    margin: { left: m, right: m },
    styles: { fontSize: 8, cellPadding: 2.5, font: "Roboto" },
    headStyles: { fillColor: [33, 152, 130], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || y + 40;
  const sigY = finalY + 25;
  doc.setDrawColor(150);
  doc.line(m, sigY, m + 70, sigY);
  doc.setFontSize(8);
  doc.text("Odgovorna osoba: _______________", m, sigY + 5);

  doc.save(`izvjestaj_${data.project.name.replace(/\s/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
