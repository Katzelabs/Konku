import { useQuery } from '@tanstack/react-query'
import { api } from './api/client'

interface Health {
  status: string
}

export default function App() {
  const { data, isPending, error } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<Health>('/health'),
  })

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">Konku</h1>
      <p className="mt-2 text-slate-600">
        Sistem belajar personal. Yang kamu pelajari tidak hilang diam-diam.
      </p>

      <p className="mt-6 text-sm text-slate-500">
        {isPending && 'Menghubungi server…'}
        {error && `Server tidak merespons: ${error.message}`}
        {data && `Server: ${data.status}`}
      </p>
    </main>
  )
}
