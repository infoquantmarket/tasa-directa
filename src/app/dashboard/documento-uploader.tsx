'use client'

import { useRef, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { registrarDocumento } from './actions'
import { validarArchivoKyc } from '@/lib/validation/kyc'
import { Button } from '@/components/ui/button'
import type { TipoDoc } from '@/types/database'

export function DocumentoUploader({
  tipo,
  usuarioId,
  esReemplazo,
}: {
  tipo: TipoDoc
  usuarioId: string
  esReemplazo: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [, startTransition] = useTransition()

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const errorValidacion = validarArchivoKyc(file.type, file.size)
    if (errorValidacion) {
      setError(errorValidacion)
      return
    }

    setError(null)
    setSubiendo(true)

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
    const path = `${usuarioId}/${tipo}-${Date.now()}.${ext}`
    const supabase = createClient()

    const { error: errorUpload } = await supabase.storage
      .from('kyc-documentos')
      .upload(path, file, { contentType: file.type })

    if (errorUpload) {
      setSubiendo(false)
      setError('No se pudo subir el archivo. Intente de nuevo.')
      return
    }

    startTransition(async () => {
      const res = await registrarDocumento(tipo, path, file.name)
      setSubiendo(false)
      if (res.error) setError(res.error)
      if (inputRef.current) inputRef.current.value = ''
    })
  }

  return (
    <div className="grid gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="hidden"
        onChange={onFileChange}
      />
      <Button
        variant={esReemplazo ? 'outline' : 'default'}
        disabled={subiendo}
        onClick={() => inputRef.current?.click()}
      >
        {subiendo ? 'Subiendo…' : esReemplazo ? 'Subir reemplazo' : 'Subir documento'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
