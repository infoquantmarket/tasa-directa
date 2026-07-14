'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { CIUDADES_COLOMBIA, etiquetaCiudad } from '@/lib/data/ciudades-colombia'

/** Quita tildes/diacríticos para que buscar "medellin" encuentre "Medellín". */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function filtrarCiudad(value: string, search: string): number {
  return normalizar(value).includes(normalizar(search)) ? 1 : 0
}

export function CiudadCombobox({
  value,
  onChange,
}: {
  value: string
  onChange: (etiqueta: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id="ciudad-trigger"
              type="button"
              variant="outline"
              className="w-full justify-between font-normal"
            />
          }
        >
          <span className={cn(!value && 'text-muted-foreground')}>
            {value || 'Seleccione una ciudad'}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0">
          <Command filter={filtrarCiudad}>
            <CommandInput placeholder="Buscar ciudad..." />
            <CommandList>
              <CommandEmpty>No se encontró la ciudad.</CommandEmpty>
              <CommandGroup>
                {CIUDADES_COLOMBIA.map((c) => {
                  const etiqueta = etiquetaCiudad(c)
                  return (
                    <CommandItem
                      key={etiqueta}
                      value={etiqueta}
                      onSelect={(selected) => {
                        onChange(selected)
                        setOpen(false)
                      }}
                    >
                      <Check
                        className={cn(
                          'mr-2 size-4',
                          value === etiqueta ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      {etiqueta}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <input type="hidden" name="ciudad" value={value} required />
    </>
  )
}
