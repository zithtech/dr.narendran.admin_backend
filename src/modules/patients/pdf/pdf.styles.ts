export const MEDICAL_PDF_STYLES = `
  @page {
    size: A4 portrait;
    margin: 12mm 12mm 14mm 12mm;
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1e293b;
    background-color: #ffffff;
    font-size: 11pt;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .pdf-container {
    width: 100%;
    margin: 0 auto;
  }

  /* Header Section */
  .pdf-header {
    border-bottom: 2px solid #0284c7;
    padding-bottom: 12px;
    margin-bottom: 16px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .brand-title {
    font-size: 18pt;
    font-weight: 700;
    color: #0369a1;
    letter-spacing: -0.5px;
  }

  .brand-subtitle {
    font-size: 9.5pt;
    color: #64748b;
    margin-top: 2px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .doc-meta {
    text-align: right;
    font-size: 9pt;
    color: #475569;
  }

  .doc-meta-title {
    font-size: 11pt;
    font-weight: 700;
    color: #0f172a;
  }

  /* Patient Card */
  .patient-card {
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 18px;
    break-inside: avoid;
  }

  .patient-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px 16px;
  }

  .patient-field-label {
    font-size: 8.5pt;
    font-weight: 600;
    text-transform: uppercase;
    color: #64748b;
    letter-spacing: 0.3px;
  }

  .patient-field-value {
    font-size: 10.5pt;
    font-weight: 600;
    color: #0f172a;
    word-break: break-word;
  }

  /* Section Styling */
  .pdf-section {
    margin-bottom: 20px;
    break-inside: auto;
  }

  .pdf-section-avoid-break {
    break-inside: avoid;
  }

  .section-title {
    font-size: 12pt;
    font-weight: 700;
    color: #0369a1;
    border-bottom: 1.5px solid #e2e8f0;
    padding-bottom: 4px;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .section-badge {
    display: inline-block;
    background-color: #e0f2fe;
    color: #0284c7;
    font-size: 8pt;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    margin-left: 8px;
  }

  /* Executive Summary Box */
  .summary-box {
    background-color: #f0fdf4;
    border-left: 4px solid #16a34a;
    border-top: 1px solid #dcfce7;
    border-right: 1px solid #dcfce7;
    border-bottom: 1px solid #dcfce7;
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 14px;
    break-inside: avoid;
  }

  .summary-alert-box {
    background-color: #fff1f2;
    border-left: 4px solid #e11d48;
    border-top: 1px solid #ffe4e6;
    border-right: 1px solid #ffe4e6;
    border-bottom: 1px solid #ffe4e6;
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 14px;
    break-inside: avoid;
  }

  /* Tables */
  table.clinical-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 12px;
    font-size: 9.5pt;
    table-layout: auto;
  }

  table.clinical-table th {
    background-color: #f1f5f9;
    color: #334155;
    font-weight: 600;
    text-align: left;
    padding: 8px 10px;
    border-bottom: 2px solid #cbd5e1;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  table.clinical-table td {
    padding: 8px 10px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: top;
    word-break: break-word;
  }

  table.clinical-table tr:nth-child(even) td {
    background-color: #f8fafc;
  }

  table.clinical-table tr {
    break-inside: avoid;
  }

  /* Badges */
  .badge {
    display: inline-block;
    font-size: 8pt;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 4px;
    text-transform: uppercase;
  }

  .badge-success { background-color: #dcfce7; color: #15803d; }
  .badge-info { background-color: #e0f2fe; color: #0369a1; }
  .badge-warning { background-color: #fef3c7; color: #b45309; }
  .badge-danger { background-color: #fee2e2; color: #b91c1c; }
  .badge-neutral { background-color: #f1f5f9; color: #475569; }

  /* Timeline Items */
  .timeline-item {
    border-left: 2px solid #cbd5e1;
    padding-left: 14px;
    margin-left: 6px;
    margin-bottom: 14px;
    position: relative;
    break-inside: avoid;
  }

  .timeline-dot {
    position: absolute;
    left: -5px;
    top: 2px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #0284c7;
  }

  .timeline-date {
    font-size: 8.5pt;
    font-weight: 600;
    color: #64748b;
  }

  .timeline-title {
    font-size: 10.5pt;
    font-weight: 700;
    color: #0f172a;
    margin-top: 1px;
  }

  .timeline-desc {
    font-size: 9.5pt;
    color: #334155;
    margin-top: 2px;
  }

  /* Cards */
  .card-item {
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 10px;
    background-color: #ffffff;
    break-inside: avoid;
  }

  .card-header-line {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .card-title {
    font-weight: 700;
    color: #0f172a;
    font-size: 10pt;
  }

  .card-subtitle {
    font-size: 8.5pt;
    color: #64748b;
  }

  .card-body-text {
    font-size: 9.5pt;
    color: #334155;
    margin-top: 4px;
    line-height: 1.4;
  }

  /* Footer */
  .pdf-footer {
    margin-top: 24px;
    border-top: 1px solid #e2e8f0;
    padding-top: 8px;
    font-size: 8pt;
    color: #94a3b8;
    display: flex;
    justify-content: space-between;
    break-inside: avoid;
  }

  .empty-state-text {
    font-style: italic;
    color: #94a3b8;
    font-size: 9.5pt;
    padding: 8px 0;
  }
`;
