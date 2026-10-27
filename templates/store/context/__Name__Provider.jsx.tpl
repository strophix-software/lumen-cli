import { useState } from 'react';
import { {{Name}}Context } from './{{Name}}Context';

export function {{Name}}Provider({ children }) {
{{contextProviderBody}}

  return (
    <{{Name}}Context.Provider value={{ {{contextValue}} }}>
      {children}
    </{{Name}}Context.Provider>
  );
}
