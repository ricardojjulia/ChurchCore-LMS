'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type ModuleCompletionPoint = {
  date: string
  completed: number
  total: number
}

export default function ModuleCompletionChart({ data }: { data: ModuleCompletionPoint[] }) {
  const t = useTranslations()
  const [showTable, setShowTable] = useState(false)
  const summary = useMemo(() => {
    if (data.length === 0) return t('reports.charts.moduleCompletion.emptyFallback')
    const latest = data[data.length - 1]
    return t('reports.charts.moduleCompletion.ariaSummaryTemplate', { completed: latest.completed, total: latest.total })
  }, [data, t])

  return (
    <div role="img" aria-label={t('reports.charts.moduleCompletion.containerAriaLabelTemplate', { summary })}>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => setShowTable((current) => !current)}
          className="text-sm font-semibold text-slate-700 underline-offset-4 hover:text-slate-950 hover:underline"
        >
          {showTable ? t('common.viewAsChart') : t('common.viewAsTable')}
        </button>
      </div>

      {showTable ? (
        <table className="w-full border-collapse text-sm" aria-label="Module completion data table">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th scope="col" className="py-2 pr-3 font-semibold text-slate-700">
                {t('reports.charts.moduleCompletion.dateHeader')}
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold text-slate-700">
                {t('reports.charts.moduleCompletion.completedHeader')}
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold text-slate-700">
                {t('reports.charts.moduleCompletion.totalHeader')}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((point) => (
              <tr key={`${point.date}-${point.completed}`} className="border-b border-slate-100">
                <th scope="row" className="py-2 pr-3 text-left font-medium text-slate-950">
                  {new Date(point.date).toLocaleDateString()}
                </th>
                <td className="py-2 pr-3 text-slate-700">{point.completed}</td>
                <td className="py-2 pr-3 text-slate-700">{point.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={(value: string) => new Date(value).toLocaleDateString()} />
              <YAxis domain={[0, 100]} />
              <Tooltip
                labelFormatter={(value) => new Date(String(value)).toLocaleDateString()}
                formatter={(value, name) => [value, name === 'completed' ? t('reports.charts.moduleCompletion.completedSeriesName') : t('reports.charts.moduleCompletion.totalSeriesName')]}
              />
              <Area type="monotone" dataKey="completed" stroke="#134074" fill="#8DA9C4" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
