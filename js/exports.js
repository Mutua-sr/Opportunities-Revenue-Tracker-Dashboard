/* Commercial Dashboard — Excel Export */

function exportDealsExcel() {
  if (typeof XLSX === 'undefined') {
    toast('Excel library not loaded', '⚠'); return;
  }

  const deals = typeof oppFiltered === 'function' ? oppFiltered() : DB.deals;
  if (!deals.length) { toast('No deals to export', '⚠'); return; }

  const COLS = [
    { key:'id',                   label:'No.'                           },
    { key:'dealName',             label:'Deal Name'                     },
    { key:'client',               label:'Client'                        },
    { key:'division',             label:'Division'                      },
    { key:'portfolio',          label:'Portfolio'                   },
    { key:'dealStage',            label:'Deal Stage'                    },
    { key:'projectStage',         label:'Project Stage'                 },
    { key:'status',               label:'Status'                        },
    { key:'prioritization',       label:'Priority'                      },
    { key:'estimatedValue',       label:'Estimated Value (KSH)', num:true },
    { key:'probability',          label:'Probability (%)',       pct:true },
    { key:'dealOwnership',        label:'Deal Owner'                    },
    { key:'country',              label:'Country'                       },
    { key:'dealSource',           label:'Deal Source'                   },
    { key:'origin',               label:'Procurement Route'             },
    { key:'entryDate',            label:'Entry Date'                    },
    { key:'proposalDate',         label:'Proposal Date'                 },
    { key:'startDate',            label:'Start Date'                    },
    { key:'signoffDate',          label:'Sign-off Date'                 },
    { key:'projectDuration',      label:'Duration (Months)'             },
    { key:'contactName',          label:'Contact Name'                  },
    { key:'phone',                label:'Phone'                         },
    { key:'role',                 label:'Role'                          },
    { key:'buyingCentre',         label:'Buying Centre'                 },
    { key:'comments',             label:'Comments'                      },
  ];

  // Build data rows
  const header = COLS.map(c => c.label);
  const rows   = deals.map(d => COLS.map(c => {
    const v = d[c.key];
    if (v === null || v === undefined || v === '') return '';
    if (c.pct) return +(parseFloat(v) * 100).toFixed(1);
    if (c.num) return +(parseFloat(v) || 0);
    return String(v);
  }));

  // Totals footer
  const totalV = deals.reduce((s, d) => s + (d.estimatedValue || 0), 0);
  const wonV   = deals.filter(d => d.status === 'Won').reduce((s, d) => s + (d.estimatedValue || 0), 0);
  const wonCt  = deals.filter(d => d.status === 'Won').length;

  // Deals sheet
  const ws = XLSX.utils.aoa_to_sheet([
    header,
    ...rows,
    [],
    ['', 'Total Deals',            deals.length],
    ['', 'Won Contracts',          wonCt],
    ['', 'Total Pipeline (KSH)',   totalV],
    ['', 'Won Value (KSH)',        wonV],
    ['', 'Exported',               new Date().toLocaleDateString('en-GB')],
  ]);

  // Column widths
  ws['!cols'] = COLS.map(c => ({ wch:
    c.key === 'dealName'    ? 48 :
    c.key === 'client'      ? 28 :
    c.key === 'comments'    ? 42 :
    c.key === 'portfolio' ? 30 :
    Math.max(c.label.length + 2, 14)
  }));

  // Freeze header row
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  // Summary sheet
  const wsSummary = XLSX.utils.aoa_to_sheet([
    ['SDG Commercial — Pipeline Summary'],
    ['Generated: ' + new Date().toLocaleString('en-GB')],
    [],
    ['Metric', 'Value'],
    ['Total Deals',          deals.length],
    ['Open',                 deals.filter(d => d.status === 'Open').length],
    ['On Hold',              deals.filter(d => d.status === 'On Hold').length],
    ['Won',                  wonCt],
    ['Lost',                 deals.filter(d => d.status === 'Lost').length],
    [],
    ['Total Pipeline (KSH)', totalV],
    ['Won Value (KSH)',       wonV],
    ['Conversion Rate',      (wonCt / deals.length * 100).toFixed(1) + '%'],
    [],
    ['Division', 'Deals', 'Won'],
    ...['DM','CI','MF','EA','ALM'].map(div => [
      DL[div] || div,
      deals.filter(d => d.division === div).length,
      deals.filter(d => d.division === div && d.status === 'Won').length,
    ]),
  ]);
  wsSummary['!cols'] = [{ wch:32 }, { wch:16 }, { wch:16 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws,        'Deals');
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  const filename = 'SDG_Pipeline_' + new Date().toISOString().slice(0, 10) + '.xlsx';
  XLSX.writeFile(wb, filename);
  toast('Downloaded ' + filename + ' · ' + deals.length + ' deals', '✓');
}
