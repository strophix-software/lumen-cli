import { useState, type ReactNode } from 'react';
import { {{Name}}Context } from './{{Name}}Context';

export interface {{Name}}ProviderProps {
  children: ReactNode;
}

export function {{Name}}Provider({ children }: {{Name}}ProviderProps) {
{{contextProviderBody}}

  return (
    <{{Name}}Context.Provider value={{ {{contextValue}} }}>
      {children}
    </{{Name}}Context.Provider>
  );
}
