'use client'

interface CsvRow {
  [key: string]: string | number
}

function rowsToCsv(rows: CsvRow[]): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const escape  = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  return [
    headers.map(escape).join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h] ?? '')).join(',')),
  ].join('\n')
}

export default function ExportCsvButton({
  rows,
  filename,
}: {
  rows: CsvRow[]
  filename: string
}) {
  function handleExport() {
    const csv  = rowsToCsv(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      onClick={handleExport}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary border border-primary/30 rounded-lg px-3 py-1.5 hover:bg-primary/5 transition-colors"
    >
      ↓ Export CSV
    </button>
  )
}
